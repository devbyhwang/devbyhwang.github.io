import {
  MIN_CHANNELS_FOR_RANKING,
  OPPORTUNITY_K,
  PENALTY_MARGINAL_SESSION,
  PENALTY_UNKNOWN_PLAYERS,
  W_OPPORTUNITY,
  W_VIEWERS,
} from "./constants";
import type { FilteredGame } from "./filter";
import type { Game, Scored, ScoreTerm } from "./types";

export function opportunity(game: Game): number {
  return game.buzz.twitchViewers / (game.buzz.twitchChannels + OPPORTUNITY_K);
}

/**
 * 후보군 내 midrank 백분위. 0~1.
 * 스펙의 `pct(log viewers)`에서 log를 뺐다 — 백분위는 순위 기반이라
 * 단조 증가 변환에 불변이므로 log가 결과를 바꾸지 않는다.
 */
export function percentile(values: number[], v: number): number {
  const n = values.length;
  if (n <= 1) return 0.5;
  let less = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) less++;
    else if (x === v) equal++;
  }
  return (less + equal / 2) / n;
}

export function rankGames(candidates: FilteredGame[]): Scored[] {
  const eligible = candidates.filter(
    (c) => c.game.buzz.twitchChannels >= MIN_CHANNELS_FOR_RANKING,
  );
  if (eligible.length === 0) return [];

  const opps = eligible.map((c) => opportunity(c.game));
  const views = eligible.map((c) => c.game.buzz.twitchViewers);

  const scored: Scored[] = eligible.map(({ game, marginalSession }) => {
    const oppPct = percentile(opps, opportunity(game));
    const viewPct = percentile(views, game.buzz.twitchViewers);

    const terms: ScoreTerm[] = [
      { kind: "opportunity", raw: oppPct, contribution: W_OPPORTUNITY * oppPct },
      { kind: "topOnTwitch", raw: viewPct, contribution: W_VIEWERS * viewPct },
    ];

    if (game.players.max === "unknown") {
      terms.push({ kind: "playerFit", raw: 0, contribution: -PENALTY_UNKNOWN_PLAYERS });
    }
    if (marginalSession) {
      terms.push({ kind: "sessionFit", raw: 0, contribution: -PENALTY_MARGINAL_SESSION });
    }

    const score = terms.reduce((acc, t) => acc + t.contribution, 0);
    return { game, score, terms, marginalSession };
  });

  return scored.sort((a, b) => b.score - a.score);
}
