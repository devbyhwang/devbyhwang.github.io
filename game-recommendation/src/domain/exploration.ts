import type { Game, Scored, SessionShape } from "./types";

export const PAGE_SIZE = 24;
export const DIVERSE_PREFIX_SIZE = 96;
export const COMPACT_EXPLORATION_FORMAT = 1;
export const ORDINAL_BYTE_WIDTH = 4;
/**
 * 896 shards keep each 278k-game card payload small while keeping the full
 * exploration artifact below the Pages-safe 2,000-file guard.
 */
export const ORDINAL_CARD_SHARD_COUNT = 896;

export type ExplorationView = "all" | "new" | "rising" | "discovery" | "classic";
export type FilteredExplorationView = Exclude<ExplorationView, "all">;

export type CompactExplorationManifest = {
  format: typeof COMPACT_EXPLORATION_FORMAT;
  generatedAt: string;
  gameCount: number;
  pageSize: typeof PAGE_SIZE;
  rank: {
    path: string;
    ordinalCount: number;
    byteLength: number;
  };
  views: Record<FilteredExplorationView, {
    path: string;
    count: number;
    byteLength: number;
  }>;
};

export type ExplorationManifest = {
  generatedAt: string;
  gameCount: number;
  pageSize: number;
  views: Record<ExplorationView, number>;
};

export type ExplorationPage = {
  ids: string[];
};

export type ExplorationCard = {
  id: string;
  name: string;
  nameKo?: string;
  coverUrl?: string;
  storeUrl?: string;
  releaseDate: string;
  players: { max: number | "unknown"; online: boolean; localCoop: boolean };
  sessionShape: SessionShape;
  twitchViewers: number;
  discountPercent?: number;
};

/** Card payload stored in compact ordinal shards. */
export type CompactExplorationCard = ExplorationCard & {
  ordinal: number;
};

export function compactExplorationManifestPath(queryKey: string): string {
  return `${compactExplorationQueryPath(queryKey)}/manifest.json`;
}

export function compactExplorationRankPath(queryKey: string): string {
  return `${compactExplorationQueryPath(queryKey)}/rank.u32le`;
}

export function compactExplorationMembershipPath(queryKey: string, view: ExplorationView): string {
  if (view === "all") throw new Error("membership bitsets require a filtered view");
  return `${compactExplorationQueryPath(queryKey)}/${view}.bits`;
}

export function compactExplorationCardShardPath(shard: number): string {
  if (!Number.isInteger(shard) || shard < 0 || shard >= ORDINAL_CARD_SHARD_COUNT) {
    throw new Error(`invalid ordinal card shard: ${shard}`);
  }
  return `exploration/cards/${shard.toString().padStart(4, "0")}.json`;
}

export function compactExplorationCardPathForOrdinal(ordinal: number): string {
  return compactExplorationCardShardPath(ordinalCardShard(ordinal));
}

export function ordinalCardShard(ordinal: number): number {
  assertOrdinal(ordinal, Number.MAX_SAFE_INTEGER);
  return ordinal % ORDINAL_CARD_SHARD_COUNT;
}

export function assertCompactExplorationCardOrdinal(card: CompactExplorationCard, gameCount: number): void {
  assertOrdinal(card.ordinal, gameCount);
}

export function encodeOrdinalRankVector(ordinals: readonly number[], gameCount: number): Uint8Array {
  assertGameCount(gameCount);
  const bytes = new Uint8Array(ordinals.length * ORDINAL_BYTE_WIDTH);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seen = new Set<number>();
  ordinals.forEach((ordinal, index) => {
    assertOrdinal(ordinal, gameCount);
    if (seen.has(ordinal)) throw new Error(`duplicate ordinal: ${ordinal}`);
    seen.add(ordinal);
    view.setUint32(index * ORDINAL_BYTE_WIDTH, ordinal, true);
  });
  return bytes;
}

export function decodeOrdinalRankVector(bytes: Uint8Array, ordinalCount: number, gameCount: number): number[] {
  assertGameCount(gameCount);
  if (!Number.isInteger(ordinalCount) || ordinalCount < 0) throw new Error(`invalid ordinal count: ${ordinalCount}`);
  const expectedByteLength = ordinalCount * ORDINAL_BYTE_WIDTH;
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(`rank vector byte length: expected ${expectedByteLength}, got ${bytes.byteLength}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seen = new Set<number>();
  return Array.from({ length: ordinalCount }, (_, index) => {
    const ordinal = view.getUint32(index * ORDINAL_BYTE_WIDTH, true);
    assertOrdinal(ordinal, gameCount);
    if (seen.has(ordinal)) throw new Error(`duplicate ordinal: ${ordinal}`);
    seen.add(ordinal);
    return ordinal;
  });
}

export function membershipBitsetByteLength(gameCount: number): number {
  assertGameCount(gameCount);
  return Math.ceil(gameCount / 8);
}

export function encodeMembershipBitset(ordinals: Iterable<number>, gameCount: number): Uint8Array {
  const bits = new Uint8Array(membershipBitsetByteLength(gameCount));
  for (const ordinal of ordinals) {
    assertOrdinal(ordinal, gameCount);
    bits[Math.floor(ordinal / 8)]! |= 1 << (ordinal % 8);
  }
  return bits;
}

export function decodeMembershipBitset(bytes: Uint8Array, gameCount: number): Uint8Array {
  const expectedByteLength = membershipBitsetByteLength(gameCount);
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(`membership bitset byte length: expected ${expectedByteLength}, got ${bytes.byteLength}`);
  }
  const finalByteBits = gameCount % 8;
  if (finalByteBits > 0 && bytes.length > 0 && (bytes[bytes.length - 1]! & ~((1 << finalByteBits) - 1)) !== 0) {
    throw new Error("membership bitset padding must be zero");
  }
  return bytes;
}

export function membershipBitsetHas(bits: Uint8Array, ordinal: number, gameCount: number): boolean {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= gameCount) return false;
  if (bits.byteLength !== membershipBitsetByteLength(gameCount)) return false;
  return (bits[Math.floor(ordinal / 8)]! & (1 << (ordinal % 8))) !== 0;
}

function compactExplorationQueryPath(queryKey: string): string {
  if (!queryKey) throw new Error("invalid exploration query key: empty");
  return `exploration/queries/${queryKey.replace(/\|/g, "_")}`;
}

function assertGameCount(gameCount: number): void {
  if (!Number.isInteger(gameCount) || gameCount < 0 || gameCount > 0x1_0000_0000) {
    throw new Error(`invalid game count: ${gameCount}`);
  }
}

function assertOrdinal(ordinal: number, gameCount: number): void {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= gameCount) {
    throw new Error(`invalid ordinal: ${ordinal}`);
  }
}

function normalizedGenres(game: Game): Set<string> {
  return new Set((game.genres ?? []).map((genre) => genre.trim().toLowerCase()));
}

function releaseEra(game: Game): number | null {
  const year = new Date(game.releaseDate).getUTCFullYear();
  return Number.isFinite(year) ? Math.floor(year / 5) : null;
}

function overlap(candidate: Game, chosen: Game): number {
  let penalty = candidate.franchise && candidate.franchise === chosen.franchise ? 0.08 : 0;
  const candidateGenres = normalizedGenres(candidate);
  for (const genre of normalizedGenres(chosen)) if (candidateGenres.has(genre)) penalty += 0.06;

  const candidateTags = new Map(candidate.topTags.map((tag) => [tag.tag, tag.share]));
  penalty += chosen.topTags.reduce(
    (total, tag) => total + (candidateTags.has(tag.tag) ? Math.min(candidateTags.get(tag.tag)!, tag.share) * 0.04 : 0),
    0,
  );

  if (releaseEra(candidate) !== null && releaseEra(candidate) === releaseEra(chosen)) penalty += 0.04;
  return penalty;
}

function compareIds(a: string, b: string): number {
  return a.localeCompare(b);
}

function compareRank(a: { game: Game; score: number }, b: { game: Game; score: number }): number {
  return b.score - a.score || compareIds(a.game.id, b.game.id);
}

/**
 * Produces deterministic IDs for static exploration pages. The introduction is
 * greedily diversified; the remaining result set stays in normal rank order.
 */
export function rerankExploration(games: Game[], scored: Scored[]): string[] {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const ranked = scored
    .map((entry) => ({ game: gamesById.get(entry.game.id) ?? entry.game, score: entry.score }))
    .sort(compareRank);
  const remaining = [...ranked];
  const penalties = remaining.map(() => 0);
  const chosen: typeof ranked = [];

  while (remaining.length && chosen.length < DIVERSE_PREFIX_SIZE) {
    let selectedIndex = 0;
    let selectedUtility = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const utility = candidate.score - penalties[index]!;
      const selected = remaining[selectedIndex]!;

      if (utility > selectedUtility || (utility === selectedUtility && compareIds(candidate.game.id, selected.game.id) < 0)) {
        selectedIndex = index;
        selectedUtility = utility;
      }
    }

    const selected = remaining.splice(selectedIndex, 1)[0]!;
    penalties.splice(selectedIndex, 1);
    chosen.push(selected);

    for (let index = 0; index < remaining.length; index += 1) {
      penalties[index]! += overlap(remaining[index]!.game, selected.game);
    }
  }

  return [...chosen, ...remaining].map((entry) => entry.game.id);
}
