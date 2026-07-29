import { MIN_CHANNELS_FOR_RANKING } from "./constants";
import { addPenalties, createScoreContext, scoreGame } from "./score";
import type { FilteredGame } from "./filter";
import type { Scored } from "./types";

export function rankGames(candidates: FilteredGame[]): Scored[] {
  const eligible = candidates.filter((c) =>
    c.game.buzz.twitchChannels >= MIN_CHANNELS_FOR_RANKING ||
    (c.game.buzz.twitchChannels === 1 && c.game.buzz.twitchViewers >= 5_000),
  );
  const population = eligible.map((c) => c.game);
  const context = createScoreContext(population);
  return eligible
    .map(({ game, marginalSession }) => addPenalties(scoreGame(game, context), marginalSession))
    .sort((a, b) => b.score - a.score || a.game.id.localeCompare(b.game.id));
}
