import type { Scored } from "./types";

const overlap = (a: Scored, b: Scored) => {
  let penalty = a.game.franchise && a.game.franchise === b.game.franchise ? 0.08 : 0;
  const genresA = new Set((a.game.genres ?? []).map((genre) => genre.trim().toLocaleLowerCase()));
  const genresB = new Set((b.game.genres ?? []).map((genre) => genre.trim().toLocaleLowerCase()));
  for (const genre of genresB) if (genresA.has(genre)) penalty += 0.06;
  const tags = new Map(a.game.topTags.map((t) => [t.tag, t.share]));
  penalty += b.game.topTags.reduce((sum, t) => sum + (tags.has(t.tag) ? Math.min(tags.get(t.tag)!, t.share) * 0.04 : 0), 0);
  return penalty;
};

export function rerankDiverse(scored: Scored[], limit: number): Scored[] {
  const remaining = [...scored];
  const chosen: Scored[] = [];
  while (remaining.length && chosen.length < limit) {
    remaining.sort((a, b) => {
      const au = a.score - chosen.reduce((p, c) => p + overlap(a, c), 0);
      const bu = b.score - chosen.reduce((p, c) => p + overlap(b, c), 0);
      return bu - au || a.game.id.localeCompare(b.game.id);
    });
    chosen.push(remaining.shift()!);
  }
  return chosen;
}
