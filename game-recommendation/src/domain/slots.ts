import {
  MIN_GROWTH_MULTIPLIER,
  MIN_REVIEWS_FOR_NEW,
  MIN_VIEWERS_FOR_GROWTH,
  SAFE_SLOT_COUNT,
} from "./constants";
import type { FilteredGame } from "./filter";
import type { Game, Scored, SlotKind } from "./types";

export type SlotAssignment = { slot: SlotKind; scored: Scored };
export type SlotPools = {
  safe: Scored[];
  rising: Scored[];
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

export function buildSlots({ safe, rising: risingCandidates, newCandidates }: SlotPools): SlotAssignment[] {
  const taken = new Taken();
  const out: SlotAssignment[] = [];

  // ① safe — 점수 상위
  for (const scored of safe) {
    if (out.length >= SAFE_SLOT_COUNT) break;
    if (taken.blocks(scored.game)) continue;
    taken.add(scored.game);
    out.push({ slot: "safe", scored });
  }

  // ② rising — 성장률 상위 1개. 볼륨 바닥 미달은 제외
  const rising = risingCandidates
    .filter((s) => {
      const g = s.game.buzz;
      return (
        g.viewerGrowth7d !== null &&
        g.viewerGrowth7d >= MIN_GROWTH_MULTIPLIER &&
        g.twitchViewers >= MIN_VIEWERS_FOR_GROWTH &&
        !taken.blocks(s.game)
      );
    })
    .sort((a, b) => (b.game.buzz.viewerGrowth7d ?? 0) - (a.game.buzz.viewerGrowth7d ?? 0))[0];

  if (rising) {
    taken.add(rising.game);
    out.push({ slot: "rising", scored: rising });
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
