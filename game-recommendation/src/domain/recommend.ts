import { SAFE_SLOT_COUNT, VIBE_THRESHOLD_RELAXED } from "./constants";
import { baseOptions, filterGames, type FilterOptions, type FilterResult } from "./filter";
import { rankGames } from "./rank";
import { buildSlots } from "./slots";
import { buildWhy } from "./why";
import type { BlockedBy, Game, Pick, Query, Recommendation, Relaxation } from "./types";

type Rung = {
  relaxation: Relaxation;
  applicable: (opts: FilterOptions) => boolean;
  apply: (opts: FilterOptions) => FilterOptions;
};

const LADDER: Rung[] = [
  {
    relaxation: "vibeThreshold",
    applicable: (o) => o.vibeThreshold > VIBE_THRESHOLD_RELAXED,
    apply: (o) => ({ ...o, vibeThreshold: VIBE_THRESHOLD_RELAXED }),
  },
  {
    relaxation: "sessionShape",
    applicable: (o) => !o.allowRejectedSession,
    apply: (o) => ({ ...o, allowRejectedSession: true }),
  },
  {
    relaxation: "viewerPlayable",
    // 애초에 요구하지 않았다면 완화할 것이 없다
    applicable: (o) => o.requireViewerPlayable,
    apply: (o) => ({ ...o, requireViewerPlayable: false }),
  },
];

function attempt(
  catalog: Game[],
  query: Query,
  opts: FilterOptions,
  strictCandidates: ReturnType<typeof filterGames>["passed"],
  asOf: string,
) {
  const { passed, counts } = filterGames(catalog, query, opts);
  const slots = buildSlots({
    safe: rankGames(passed),
    rising: rankGames(strictCandidates),
    discoveryCandidates: strictCandidates,
    newCandidates: strictCandidates,
  });
  const picks: Pick[] = slots.map(({ slot, scored }) => ({
    slot,
    game: scored.game,
    score: scored.score,
    why: buildWhy(scored, slot, query, asOf),
    terms: scored.terms,
  }));
  return { picks, candidateCount: passed.length, counts };
}

export function recommend(
  catalog: Game[],
  query: Query,
  asOf = new Date().toISOString(),
): Recommendation {
  let opts = baseOptions(query);
  const strict = filterGames(catalog, query, opts);
  const applied = new Set<Relaxation>();
  let result = attempt(catalog, query, opts, strict.passed, asOf);

  for (const rung of LADDER) {
    const safeCount = result.picks.filter((p) => p.slot === "safe").length;
    if (safeCount >= SAFE_SLOT_COUNT) break;
    if (!rung.applicable(opts)) continue;

    opts = rung.apply(opts);
    applied.add(rung.relaxation);
    const attempted = attempt(catalog, query, opts, strict.passed, asOf);
    // 뒤의 완화가 먼저 적용한 완화의 효과를 드러낼 수 있으므로, 중간 단계에서
    // 후보가 늘지 않았다는 이유만으로 누적 옵션을 되돌리지 않는다.
    result = attempted;
  }

  const base = baseOptions(query);
  const relaxations = LADDER.flatMap(({ relaxation }) => {
    if (!applied.has(relaxation)) return [];
    const without = { ...opts };
    if (relaxation === "vibeThreshold") without.vibeThreshold = base.vibeThreshold;
    if (relaxation === "sessionShape") without.allowRejectedSession = base.allowRejectedSession;
    if (relaxation === "viewerPlayable") without.requireViewerPlayable = base.requireViewerPlayable;
    const withoutCount = filterGames(catalog, query, without).passed.length;
    return withoutCount < result.candidateCount ? [relaxation] : [];
  });

  return {
    picks: result.picks,
    relaxations,
    candidateCount: result.candidateCount,
    blockedBy: result.picks.length === 0 ? firstBlockingStage(result.counts) : null,
  };
}

/**
 * 필터 단계별 잔여 수에서 후보를 0으로 만든 첫 단계를 찾는다.
 * counts는 누적 생존 수이므로, 0이 되는 첫 단계가 원인이다.
 *
 * viewerPlayable·session을 판정하지 않는 이유:
 * 이 함수는 picks가 0일 때만 불린다. 그 시점에는 완화 사다리가 이미 세 칸을
 * 모두 내려가 requireViewerPlayable=false, allowRejectedSession=true인 상태다.
 * 그래서 counts.viewerPlayable === counts.players 이고
 * counts.session === counts.vibe 라, 두 단계는 결코 원인일 수 없다.
 * 그런데도 두 값을 반환하면 사용자에게 거짓 원인("방송 길이를 늘려보세요")을 알리게 된다.
 * 다시 추가하지 말 것.
 *
 * 필터를 모두 통과하고도 결과가 없다면 원인은 랭킹·슬롯 배정
 * (채널 수 하한 미달 등)이며, 어느 입력 조건 탓인지 알 수 없다 → "other".
 */
function firstBlockingStage(
  counts: FilterResult["counts"],
): BlockedBy {
  if (counts.players === 0) return "players";
  if (counts.vibe === 0) return "vibe";
  return "other";
}
