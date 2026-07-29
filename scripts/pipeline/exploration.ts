import {
  COMPACT_EXPLORATION_FORMAT,
  ORDINAL_BYTE_WIDTH,
  ORDINAL_CARD_SHARD_COUNT,
  PAGE_SIZE,
  assertCompactExplorationCardOrdinal,
  compactExplorationCardShardPath,
  compactExplorationManifestPath,
  compactExplorationMembershipPath,
  compactExplorationRankPath,
  decodeMembershipBitset,
  decodeOrdinalRankVector,
  encodeMembershipBitset,
  encodeOrdinalRankVector,
  membershipBitsetByteLength,
  membershipBitsetHas,
  ordinalCardShard,
  rerankExploration,
  type CompactExplorationCard,
  type CompactExplorationManifest,
  type FilteredExplorationView,
} from "../../game-recommendation/src/domain/exploration";
import { MIN_GROWTH_MULTIPLIER, MIN_VIEWERS_FOR_GROWTH } from "../../game-recommendation/src/domain/constants";
import { filterGames, baseOptions } from "../../game-recommendation/src/domain/filter";
import { ALL_QUERIES, recommendationKey } from "../../game-recommendation/src/domain/recommendation-index";
import { addPenalties, createScoreContext, scoreGame } from "../../game-recommendation/src/domain/score";
import type { Query } from "../../game-recommendation/src/domain/types";
import type { FileStore } from "./emit";
import type { CatalogRecord, GameRecord } from "./model";
import { validateCatalog } from "./schema";

const ASSET_ROOT = "src/playground/game-recommendation/";
export const EXPLORATION_PATH = `${ASSET_ROOT}exploration/manifest.json`;
const FILTERED_VIEWS: readonly FilteredExplorationView[] = ["new", "rising", "discovery", "classic"];

export type ExplorationIndex = {
  format: typeof COMPACT_EXPLORATION_FORMAT;
  generatedAt: string;
  gameCount: number;
  pageSize: typeof PAGE_SIZE;
  queries: string[];
};

export function explorationManifestPath(query: Query): string {
  return assetPath(compactExplorationManifestPath(recommendationKey(query)));
}

export function explorationRankPath(query: Query): string {
  return assetPath(compactExplorationRankPath(recommendationKey(query)));
}

export function explorationMembershipPath(query: Query, view: FilteredExplorationView): string {
  return assetPath(compactExplorationMembershipPath(recommendationKey(query), view));
}

export function explorationCardPath(shard: number): string {
  return assetPath(compactExplorationCardShardPath(shard));
}

export function emitExploration(catalog: CatalogRecord, fs: FileStore): ExplorationIndex {
  validateCatalog(catalog);
  const ids = catalog.games.map((game) => game.id);
  const ordinalsById = new Map(ids.map((id, ordinal) => [id, ordinal]));
  writeCards(catalog.games, ordinalsById, fs);

  const queries = ALL_QUERIES.map(recommendationKey);
  const expectedMembership = new Map<string, Record<FilteredExplorationView, Set<number>>>();
  for (const query of ALL_QUERIES) {
    const key = recommendationKey(query);
    const ranked = rankedIds(catalog.games, query);
    const ordinals = ranked.map((id) => requiredOrdinal(ordinalsById, id));
    const memberships = viewOrdinals(catalog.games, ranked, ordinalsById, catalog.generatedAt);
    expectedMembership.set(key, memberships);
    const manifest: CompactExplorationManifest = {
      format: COMPACT_EXPLORATION_FORMAT,
      generatedAt: catalog.generatedAt,
      gameCount: catalog.games.length,
      pageSize: PAGE_SIZE,
      rank: { path: compactExplorationRankPath(key), ordinalCount: ordinals.length, byteLength: ordinals.length * ORDINAL_BYTE_WIDTH },
      views: Object.fromEntries(FILTERED_VIEWS.map((view) => {
        const path = compactExplorationMembershipPath(key, view);
        return [view, { path, count: memberships[view].size, byteLength: membershipBitsetByteLength(catalog.games.length) }];
      })) as CompactExplorationManifest["views"],
    };
    fs.writeAtomic(explorationManifestPath(query), stringify(manifest));
    writeBytes(fs, explorationRankPath(query), encodeOrdinalRankVector(ordinals, catalog.games.length));
    for (const view of FILTERED_VIEWS) {
      writeBytes(fs, explorationMembershipPath(query, view), encodeMembershipBitset(memberships[view], catalog.games.length));
    }
  }
  const index: ExplorationIndex = { format: COMPACT_EXPLORATION_FORMAT, generatedAt: catalog.generatedAt, gameCount: catalog.games.length, pageSize: PAGE_SIZE, queries };
  fs.writeAtomic(EXPLORATION_PATH, stringify(index));
  validateExploration(index, fs, new Set(ids), expectedMembership);
  return index;
}

export function readExploration(fs: FileStore, catalogIds?: ReadonlySet<string>): ExplorationIndex | null {
  const contents = fs.read(EXPLORATION_PATH);
  if (contents === null) return null;
  const index = parse<ExplorationIndex>(contents, EXPLORATION_PATH);
  validateExploration(index, fs, catalogIds);
  return index;
}

function rankedIds(games: GameRecord[], query: Query): string[] {
  const filtered = filterGames(games, query, baseOptions(query));
  const context = createScoreContext(filtered.passed.map(({ game }) => game));
  const scored = filtered.passed
    .map(({ game, marginalSession }) => addPenalties(scoreGame(game, context), marginalSession))
    .sort((a, b) => b.score - a.score || compareIds(a.game.id, b.game.id));
  return rerankExploration(games, scored);
}

function viewOrdinals(games: GameRecord[], orderedIds: string[], ordinalsById: ReadonlyMap<string, number>, generatedAt: string): Record<FilteredExplorationView, Set<number>> {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const selected = (predicate: (game: GameRecord) => boolean) => new Set(orderedIds
    .filter((id) => predicate(gamesById.get(id)!))
    .map((id) => requiredOrdinal(ordinalsById, id)));
  const classicYear = new Date(generatedAt).getUTCFullYear() - 5;
  return {
    new: selected((game) => game.buzz.isNewRelease),
    rising: selected((game) => game.buzz.twitchViewers >= MIN_VIEWERS_FOR_GROWTH && (game.streaming.growth7d ?? game.buzz.viewerGrowth7d ?? 0) >= MIN_GROWTH_MULTIPLIER),
    discovery: selected((game) => !game.buzz.isNewRelease && (game.buzz.twitchViewers <= 1_000 || game.buzz.twitchChannels < 5)),
    classic: selected((game) => new Date(game.releaseDate).getUTCFullYear() <= classicYear),
  };
}

function toCard(game: GameRecord, ordinal: number): CompactExplorationCard {
  return {
    id: game.id, name: game.name, ...(game.nameKo ? { nameKo: game.nameKo } : {}), ...(game.coverUrl ? { coverUrl: game.coverUrl } : {}), ...(game.storeUrl ? { storeUrl: game.storeUrl } : {}),
    releaseDate: game.releaseDate,
    players: { max: game.players.max, online: game.players.online, localCoop: game.players.localCoop },
    sessionShape: game.sessionShape, twitchViewers: game.buzz.twitchViewers,
    ...(game.discountPercent === undefined ? {} : { discountPercent: game.discountPercent }), ordinal,
  };
}

function writeCards(games: GameRecord[], ordinalsById: ReadonlyMap<string, number>, fs: FileStore): void {
  const shards = Array.from({ length: ORDINAL_CARD_SHARD_COUNT }, () => [] as CompactExplorationCard[]);
  for (const game of games) {
    const ordinal = requiredOrdinal(ordinalsById, game.id);
    shards[ordinalCardShard(ordinal)]!.push(toCard(game, ordinal));
  }
  shards.forEach((cards, shard) => fs.writeAtomic(explorationCardPath(shard), stringify(cards.sort((a, b) => a.ordinal - b.ordinal))));
}

function validateExploration(index: ExplorationIndex, fs: FileStore, catalogIds?: ReadonlySet<string>, expectedMembership?: ReadonlyMap<string, Record<FilteredExplorationView, Set<number>>>): void {
  if (index.format !== COMPACT_EXPLORATION_FORMAT) throw new Error("exploration format: invalid");
  if (!isIso(index.generatedAt)) throw new Error("exploration generatedAt: invalid");
  if (!Number.isInteger(index.gameCount) || index.gameCount < 0) throw new Error("exploration gameCount: invalid");
  if (index.pageSize !== PAGE_SIZE) throw new Error(`exploration pageSize: expected ${PAGE_SIZE}`);
  const expectedQueries = ALL_QUERIES.map(recommendationKey);
  if (!sameStrings(index.queries, expectedQueries)) throw new Error("exploration queries: incomplete");

  const cards = new Map<number, CompactExplorationCard>();
  const cardIds = new Set<string>();
  for (let shard = 0; shard < ORDINAL_CARD_SHARD_COUNT; shard += 1) {
    const path = explorationCardPath(shard);
    const shardCards = parse<unknown>(required(fs, path), path);
    if (!Array.isArray(shardCards)) throw new Error(`${path}: invalid card shard`);
    for (const value of shardCards) {
      if (!isCompactCard(value, index.gameCount)) throw new Error(`${path}: invalid card`);
      const card = value;
      if (ordinalCardShard(card.ordinal) !== shard || cards.has(card.ordinal) || cardIds.has(card.id)) throw new Error(`${path}: duplicate or wrong-shard card`);
      cards.set(card.ordinal, card); cardIds.add(card.id);
    }
  }
  if (cards.size !== index.gameCount || cardIds.size !== index.gameCount) throw new Error("exploration cards: count or duplicate mismatch");
  if (catalogIds && (!sameSet(cardIds, catalogIds) || catalogIds.size !== index.gameCount)) throw new Error("exploration cards: outside-catalog ID or catalog coverage mismatch");

  for (const query of ALL_QUERIES) {
    const key = recommendationKey(query);
    const manifestPath = explorationManifestPath(query);
    const manifest = parse<CompactExplorationManifest>(required(fs, manifestPath), manifestPath);
    validateManifest(manifest, index, key, manifestPath);
    const rank = decodeOrdinalRankVector(requiredBytes(fs, explorationRankPath(query)), manifest.rank.ordinalCount, index.gameCount);
    if (manifest.rank.byteLength !== rank.length * ORDINAL_BYTE_WIDTH || rank.some((ordinal) => !cards.has(ordinal))) throw new Error(`${manifestPath}: rank is malformed`);
    const rankSet = new Set(rank);
    for (const view of FILTERED_VIEWS) {
      const descriptor = manifest.views[view];
      const bits = decodeMembershipBitset(requiredBytes(fs, explorationMembershipPath(query, view)), index.gameCount);
      if (descriptor.byteLength !== bits.byteLength) throw new Error(`${manifestPath}: ${view} byte length mismatch`);
      const members = new Set(rank.filter((ordinal) => membershipBitsetHas(bits, ordinal, index.gameCount)));
      const setOrdinals = bitsetOrdinals(bits, index.gameCount);
      if (members.size !== descriptor.count || setOrdinals.size !== descriptor.count || [...setOrdinals].some((ordinal) => !rankSet.has(ordinal))) throw new Error(`${manifestPath}: ${view} membership mismatch`);
      const expected = expectedMembership?.get(key)?.[view];
      if (expected && !sameNumberSet(members, expected)) throw new Error(`${manifestPath}: ${view} semantics mismatch`);
    }
  }
}

function validateManifest(manifest: CompactExplorationManifest, index: ExplorationIndex, key: string, path: string): void {
  if (!manifest || manifest.format !== COMPACT_EXPLORATION_FORMAT || manifest.generatedAt !== index.generatedAt || manifest.gameCount !== index.gameCount || manifest.pageSize !== PAGE_SIZE) throw new Error(`${path}: metadata mismatch`);
  if (!manifest.rank || manifest.rank.path !== compactExplorationRankPath(key) || !Number.isInteger(manifest.rank.ordinalCount) || manifest.rank.ordinalCount < 0 || manifest.rank.byteLength !== manifest.rank.ordinalCount * ORDINAL_BYTE_WIDTH) throw new Error(`${path}: rank descriptor mismatch`);
  if (!manifest.views || Object.keys(manifest.views).length !== FILTERED_VIEWS.length) throw new Error(`${path}: view descriptors mismatch`);
  for (const view of FILTERED_VIEWS) {
    const descriptor = manifest.views[view];
    if (!descriptor || descriptor.path !== compactExplorationMembershipPath(key, view) || !Number.isInteger(descriptor.count) || descriptor.count < 0 || descriptor.byteLength !== membershipBitsetByteLength(index.gameCount)) throw new Error(`${path}: ${view} descriptor mismatch`);
  }
}

function isCompactCard(value: unknown, gameCount: number): value is CompactExplorationCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as CompactExplorationCard;
  if (typeof card.id !== "string" || !card.id || typeof card.name !== "string" || typeof card.releaseDate !== "string") return false;
  try { assertCompactExplorationCardOrdinal(card, gameCount); return true; } catch { return false; }
}

function writeBytes(fs: FileStore, path: string, value: Uint8Array): void {
  if (!fs.writeAtomicBytes) throw new Error("FileStore does not support binary exploration artifacts");
  fs.writeAtomicBytes(path, value);
}
function requiredBytes(fs: FileStore, path: string): Uint8Array {
  if (!fs.readBytes) throw new Error("FileStore does not support binary exploration artifacts");
  const value = fs.readBytes(path); if (value === null) throw new Error(`${path}: missing`); return value;
}
function required(fs: FileStore, path: string): string { const value = fs.read(path); if (value === null) throw new Error(`${path}: missing`); return value; }
function parse<T>(contents: string, path: string): T { try { return JSON.parse(contents) as T; } catch { throw new Error(`${path}: invalid JSON`); } }
function stringify(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }
function assetPath(path: string): string { return `${ASSET_ROOT}${path}`; }
function requiredOrdinal(ordinals: ReadonlyMap<string, number>, id: string): number { const ordinal = ordinals.get(id); if (ordinal === undefined) throw new Error(`missing catalog ordinal: ${id}`); return ordinal; }
function compareIds(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function bitsetOrdinals(bits: Uint8Array, gameCount: number): Set<number> {
  const ordinals = new Set<number>();
  for (let ordinal = 0; ordinal < gameCount; ordinal += 1) if (membershipBitsetHas(bits, ordinal, gameCount)) ordinals.add(ordinal);
  return ordinals;
}
function isIso(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value; }
function sameStrings(actual: unknown, expected: string[]): actual is string[] { return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]); }
function sameSet(actual: Iterable<string>, expected: ReadonlySet<string>): boolean { const values = new Set(actual); return values.size === expected.size && [...values].every((value) => expected.has(value)); }
function sameNumberSet(actual: ReadonlySet<number>, expected: ReadonlySet<number>): boolean { return actual.size === expected.size && [...actual].every((value) => expected.has(value)); }
