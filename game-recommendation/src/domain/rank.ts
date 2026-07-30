import { MIN_CHANNELS_FOR_RANKING, MIN_DEMAND_PERCENTILE_FOR_RANKING } from "./constants";
import { addPenalties, createScoreContext, demandPercentile, scoreGame } from "./score";
import type { FilteredGame } from "./filter";
import type { Scored } from "./types";

export function rankGames(candidates: FilteredGame[]): Scored[] {
  const candidateContext = createScoreContext(candidates.map((candidate) => candidate.game));
  const eligible = candidates.filter((c) =>
    c.game.buzz.twitchChannels >= MIN_CHANNELS_FOR_RANKING ||
    (c.game.buzz.twitchChannels === 1 && demandPercentile(c.game, candidateContext) >= MIN_DEMAND_PERCENTILE_FOR_RANKING),
  );
  const population = eligible.map((c) => c.game);
  const context = createScoreContext(population);
  return eligible
    .map(({ game, marginalSession }) => addPenalties(scoreGame(game, context), marginalSession))
    .sort((a, b) => b.score - a.score || a.game.id.localeCompare(b.game.id));
}
