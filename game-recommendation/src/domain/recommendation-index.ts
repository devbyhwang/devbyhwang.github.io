import { VIBE_KEYS, type Query, type Recommendation } from "./types";

const LENGTHS: readonly Query["length"][] = ["short", "medium", "long"];
const PLAYERS: readonly Query["players"][] = [1, 2, 3, 4, 5];
const PARTICIPATION: readonly boolean[] = [false, true];

export const ALL_QUERIES: readonly Query[] = LENGTHS.flatMap((length) => PLAYERS.flatMap((players) =>
  PARTICIPATION.flatMap((viewerParticipation) => VIBE_KEYS.map((vibe) => ({ length, players, viewerParticipation, vibe }))),
));

export function recommendationKey({ length, players, viewerParticipation, vibe }: Query): string {
  return `${length}|${players}|${viewerParticipation ? 1 : 0}|${vibe}`;
}

export type RecommendationIndex = {
  generatedAt: string;
  gameCount: number;
  recommendations: Record<string, Recommendation>;
};
