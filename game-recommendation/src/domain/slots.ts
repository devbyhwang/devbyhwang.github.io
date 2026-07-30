import {
  MAX_DEMAND_PERCENTILE_FOR_DISCOVERY,
  MIN_DISCOVERY_CONFIDENCE,
  MIN_GROWTH_MULTIPLIER,
  MIN_GROWTH_CONFIDENCE,
  MIN_QUALITY_FLOOR,
  MIN_REVIEWS_FOR_NEW,
  MIN_DEMAND_PERCENTILE_FOR_GROWTH,
  SAFE_SLOT_COUNT,
} from "./constants";
import { rerankDiverse } from "./diversity";
import { addPenalties, createScoreContext, demandPercentile, scoreGame } from "./score";
import type { FilteredGame } from "./filter";
import type { Game, Scored, SlotKind } from "./types";

export type SlotAssignment = { slot: SlotKind | "discovery"; scored: Scored };
export type SlotPools = {
  safe: Scored[];
  rising: Scored[];
  discoveryCandidates: FilteredGame[];
  newCandidates: FilteredGame[];
};

/** 이미 배치된 게임·프랜차이즈를 추적해 중복을 막는다. */
class Taken {
  private ids = new Set<string>();
  private franchises = new Set<string>();

  blocks(game: Game): boolean {
    if (this.ids.has(game.id)) return true;
    return Boolean(game.franchise && this.franchises.has(game.franchise));
  }

  add(game: Game): void {
    this.ids.add(game.id);
    if (game.franchise) this.franchises.add(game.franchise);
  }
}

export function buildSlots({ safe, rising: risingCandidates, discoveryCandidates, newCandidates }: SlotPools): SlotAssignment[] {
  const taken = new Taken();
  const out: SlotAssignment[] = [];

  // ① safe — 점수 상위
  for (const scored of rerankDiverse(safe.filter((s) => !s.game.buzz.isNewRelease), SAFE_SLOT_COUNT)) {
    if (out.length >= SAFE_SLOT_COUNT) break;
    if (taken.blocks(scored.game)) continue;
    taken.add(scored.game);
    out.push({ slot: "safe", scored });
  }

  // ② rising — 성장률 상위 1개. 볼륨 바닥 미달은 제외
  const risingContext = createScoreContext(risingCandidates.map((candidate) => candidate.game));
  const rising = risingCandidates
    .filter((s) => {
      const growth = s.game.streaming;
      const windows = [growth.growth7d, growth.growth30d, growth.growth90d].filter((v): v is number => v !== null && v !== undefined);
      const consistentGrowth = windows.length >= 2 && windows.reduce((a, v) => a + v, 0) / windows.length >= MIN_GROWTH_MULTIPLIER;
      const confidence = s.terms.find((t) => t.kind === "confidence")?.raw ?? 0;
      return (
        consistentGrowth &&
        confidence >= MIN_GROWTH_CONFIDENCE &&
        demandPercentile(s.game, risingContext) >= MIN_DEMAND_PERCENTILE_FOR_GROWTH &&
        !taken.blocks(s.game)
      );
    })
    .sort((a, b) => (b.terms.find((t) => t.kind === "growth")?.raw ?? 0) - (a.terms.find((t) => t.kind === "growth")?.raw ?? 0) || a.game.id.localeCompare(b.game.id))[0];

  if (rising) {
    taken.add(rising.game);
    out.push({ slot: "rising", scored: rising });
  }

  const discoveryPopulation = discoveryCandidates.map((c) => c.game);
  const discoveryContext = createScoreContext(discoveryPopulation);
  const discovery = discoveryCandidates
    .map((candidate) => addPenalties(scoreGame(candidate.game, discoveryContext), candidate.marginalSession))
    .filter((s) => {
      const quality = s.terms.find((t) => t.kind === "quality")?.raw ?? 0;
      const confidence = s.terms.find((t) => t.kind === "confidence")?.raw ?? 0;
      return quality >= MIN_QUALITY_FLOOR && confidence >= MIN_DISCOVERY_CONFIDENCE &&
        !s.game.buzz.isNewRelease && s.game.streaming.coverage > 0 &&
        demandPercentile(s.game, discoveryContext) <= MAX_DEMAND_PERCENTILE_FOR_DISCOVERY && !taken.blocks(s.game);
    })
    .sort((a, b) => b.score - a.score || a.game.id.localeCompare(b.game.id))[0];
  if (discovery) {
    taken.add(discovery.game);
    out.push({ slot: "discovery", scored: discovery });
  }

  // ③ new — 출시 30일 이내 중 평점 상위. 채널 수 하한을 적용하지 않으므로
  //    ranked가 아니라 candidates에서 뽑는다.
  const scoredById = new Map(safe.map((s) => [s.game.id, s]));
  const fresh = newCandidates
    .map((c) => c.game)
    .filter(
      (g) =>
        g.buzz.isNewRelease &&
        (g.reviewCount ?? 0) >= MIN_REVIEWS_FOR_NEW &&
        g.rating !== undefined &&
        !taken.blocks(g),
    )
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

  if (fresh) {
    const scored: Scored = scoredById.get(fresh.id) ?? {
      game: fresh,
      score: 0,
      terms: [{ kind: "newRelease", raw: fresh.rating ?? 0, contribution: 0 }],
      marginalSession:
        newCandidates.find((c) => c.game.id === fresh.id)?.marginalSession ?? false,
    };
    taken.add(fresh);
    out.push({ slot: "new", scored });
  }

  return out;
}
