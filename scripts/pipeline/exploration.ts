import { PAGE_SIZE, rerankExploration, type ExplorationCard, type ExplorationManifest, type ExplorationPage, type ExplorationView } from "../../game-recommendation/src/domain/exploration";
import { MIN_GROWTH_MULTIPLIER, MIN_VIEWERS_FOR_GROWTH } from "../../game-recommendation/src/domain/constants";
import { filterGames, baseOptions } from "../../game-recommendation/src/domain/filter";
import { ALL_QUERIES, recommendationKey } from "../../game-recommendation/src/domain/recommendation-index";
import { addPenalties, createScoreContext, scoreGame } from "../../game-recommendation/src/domain/score";
import type { Query } from "../../game-recommendation/src/domain/types";
import type { FileStore } from "./emit";
import type { CatalogRecord, GameRecord } from "./model";
import { validateCatalog } from "./schema";

export const EXPLORATION_PATH = "src/playground/game-recommendation/exploration/manifest.json";
export const CARD_SHARD_COUNT = 64;
const VIEWS: readonly ExplorationView[] = ["all", "new", "rising", "discovery", "classic"];

export type ExplorationIndex = {
  generatedAt: string;
  gameCount: number;
  pageSize: number;
  queries: string[];
};

export function explorationManifestPath(query: Query): string {
  return `src/playground/game-recommendation/exploration/queries/${recommendationKey(query)}/manifest.json`;
}

export function explorationPagePath(query: Query, view: ExplorationView, page: number): string {
  if (!Number.isInteger(page) || page < 0) throw new Error(`invalid exploration page: ${page}`);
  return `src/playground/game-recommendation/exploration/queries/${recommendationKey(query)}/${view}/${page}.json`;
}

export function explorationCardPath(shard: number): string {
  if (!Number.isInteger(shard) || shard < 0 || shard >= CARD_SHARD_COUNT) throw new Error(`invalid card shard: ${shard}`);
  return `src/playground/game-recommendation/exploration/cards/${shard.toString().padStart(2, "0")}.json`;
}

export function cardShardFor(id: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % CARD_SHARD_COUNT;
}

export function emitExploration(catalog: CatalogRecord, fs: FileStore): ExplorationIndex {
  validateCatalog(catalog);
  const cards = new Map(catalog.games.map((game) => [game.id, toCard(game)]));
  writeCards(cards, fs);

  const queries = ALL_QUERIES.map(recommendationKey);
  for (const query of ALL_QUERIES) {
    const ids = rankedIds(catalog.games, query);
    const views = viewIds(catalog.games, ids, catalog.generatedAt);
    const manifest: ExplorationManifest = {
      generatedAt: catalog.generatedAt,
      gameCount: catalog.games.length,
      pageSize: PAGE_SIZE,
      views: Object.fromEntries(VIEWS.map((view) => [view, views[view].length])) as ExplorationManifest["views"],
    };
    fs.writeAtomic(explorationManifestPath(query), stringify(manifest));
    for (const view of VIEWS) {
      pages(views[view]).forEach((ids, page) => fs.writeAtomic(explorationPagePath(query, view, page), stringify({ ids })));
    }
  }
  const index: ExplorationIndex = { generatedAt: catalog.generatedAt, gameCount: catalog.games.length, pageSize: PAGE_SIZE, queries };
  fs.writeAtomic(EXPLORATION_PATH, stringify(index));
  validateExploration(index, fs);
  return index;
}

export function readExploration(fs: FileStore, catalogIds?: ReadonlySet<string>): ExplorationIndex | null {
  const contents = fs.read(EXPLORATION_PATH);
  if (contents === null) return null;
  const index = parse<ExplorationIndex>(contents, EXPLORATION_PATH);
  validateExploration(index, fs, catalogIds);
  return index;
}

export function readExplorationPage(fs: FileStore, query: Query, view: ExplorationView, page: number): ExplorationPage {
  return parse<ExplorationPage>(required(fs, explorationPagePath(query, view, page)), explorationPagePath(query, view, page));
}

export function readExplorationCardShard(fs: FileStore, id: string): ExplorationCard[] {
  return parse<ExplorationCard[]>(required(fs, explorationCardPath(cardShardFor(id))), explorationCardPath(cardShardFor(id)));
}

function rankedIds(games: GameRecord[], query: Query): string[] {
  const filtered = filterGames(games, query, baseOptions(query));
  const context = createScoreContext(filtered.passed.map(({ game }) => game));
  const scored = filtered.passed
    .map(({ game, marginalSession }) => addPenalties(scoreGame(game, context), marginalSession))
    .sort((a, b) => b.score - a.score || a.game.id.localeCompare(b.game.id));
  return rerankExploration(games, scored);
}

function viewIds(games: GameRecord[], orderedIds: string[], generatedAt: string): Record<ExplorationView, string[]> {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const selected = (predicate: (game: GameRecord) => boolean) => orderedIds.filter((id) => predicate(gamesById.get(id)!));
  const classicYear = new Date(generatedAt).getUTCFullYear() - 5;
  return {
    all: orderedIds,
    new: selected((game) => game.buzz.isNewRelease),
    rising: selected((game) => game.buzz.twitchViewers >= MIN_VIEWERS_FOR_GROWTH && (game.streaming.growth7d ?? game.buzz.viewerGrowth7d ?? 0) >= MIN_GROWTH_MULTIPLIER),
    discovery: selected((game) => !game.buzz.isNewRelease && (game.buzz.twitchViewers <= 1_000 || game.buzz.twitchChannels < 5)),
    classic: selected((game) => new Date(game.releaseDate).getUTCFullYear() <= classicYear),
  };
}

function toCard(game: GameRecord): ExplorationCard {
  return {
    id: game.id,
    name: game.name,
    ...(game.nameKo ? { nameKo: game.nameKo } : {}),
    ...(game.coverUrl ? { coverUrl: game.coverUrl } : {}),
    ...(game.storeUrl ? { storeUrl: game.storeUrl } : {}),
    releaseDate: game.releaseDate,
    players: { max: game.players.max, online: game.players.online, localCoop: game.players.localCoop },
    sessionShape: game.sessionShape,
    twitchViewers: game.buzz.twitchViewers,
    ...(game.discountPercent === undefined ? {} : { discountPercent: game.discountPercent }),
  };
}

function writeCards(cards: Map<string, ExplorationCard>, fs: FileStore): void {
  const shards = Array.from({ length: CARD_SHARD_COUNT }, () => [] as ExplorationCard[]);
  for (const card of cards.values()) shards[cardShardFor(card.id)]!.push(card);
  shards.forEach((cards, shard) => fs.writeAtomic(explorationCardPath(shard), stringify(cards.sort((a, b) => a.id.localeCompare(b.id)))));
}

function pages(ids: string[]): string[][] {
  return Array.from({ length: Math.ceil(ids.length / PAGE_SIZE) }, (_, page) => ids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
}

function validateExploration(index: ExplorationIndex, fs: FileStore, catalogIds?: ReadonlySet<string>): void {
  if (!isIso(index.generatedAt)) throw new Error("exploration generatedAt: invalid");
  if (!Number.isInteger(index.gameCount) || index.gameCount < 0) throw new Error("exploration gameCount: invalid");
  if (index.pageSize !== PAGE_SIZE) throw new Error(`exploration pageSize: expected ${PAGE_SIZE}`);
  const expectedQueries = ALL_QUERIES.map(recommendationKey);
  if (!sameStrings(index.queries, expectedQueries)) throw new Error("exploration queries: incomplete");

  const cards = new Map<string, number>();
  for (let shard = 0; shard < CARD_SHARD_COUNT; shard += 1) {
    const path = explorationCardPath(shard);
    const shardCards = parse<ExplorationCard[]>(required(fs, path), path);
    for (const card of shardCards) {
      if (!card || typeof card.id !== "string" || cardShardFor(card.id) !== shard) throw new Error(`${path}: invalid card`);
      cards.set(card.id, (cards.get(card.id) ?? 0) + 1);
    }
  }
  if (cards.size !== index.gameCount || [...cards.values()].some((count) => count !== 1)) throw new Error("exploration cards: count or duplicate mismatch");
  if (catalogIds && (!sameSet(cards.keys(), catalogIds) || catalogIds.size !== index.gameCount)) {
    throw new Error("exploration cards: outside-catalog ID or catalog coverage mismatch");
  }

  for (const query of ALL_QUERIES) {
    const manifestPath = explorationManifestPath(query);
    const manifest = parse<ExplorationManifest>(required(fs, manifestPath), manifestPath);
    if (manifest.generatedAt !== index.generatedAt || manifest.gameCount !== index.gameCount || manifest.pageSize !== PAGE_SIZE) throw new Error(`${manifestPath}: metadata mismatch`);
    for (const view of VIEWS) {
      const count = manifest.views?.[view];
      if (!Number.isInteger(count) || count < 0) throw new Error(`${manifestPath}: missing ${view} view`);
      const ids: string[] = [];
      const pageCount = Math.ceil(count / PAGE_SIZE);
      for (let page = 0; page < pageCount; page += 1) {
        const pagePath = explorationPagePath(query, view, page);
        const value = parse<ExplorationPage>(required(fs, pagePath), pagePath);
        const expectedPageSize = page + 1 < pageCount ? PAGE_SIZE : count % PAGE_SIZE || PAGE_SIZE;
        if (!Array.isArray(value.ids) || value.ids.length !== expectedPageSize) throw new Error(`${pagePath}: page size must be ${expectedPageSize}`);
        ids.push(...value.ids);
      }
      if (ids.length !== count || new Set(ids).size !== ids.length) throw new Error(`${manifestPath}: ${view} page coverage mismatch`);
      for (const id of ids) {
        if (catalogIds && !catalogIds.has(id)) throw new Error(`${manifestPath}: ${view} references outside-catalog ID ${id}`);
        if (cards.get(id) !== 1) throw new Error(`${manifestPath}: ${view} references ${id} without exactly one card`);
      }
    }
  }
}

function required(fs: FileStore, path: string): string {
  const value = fs.read(path);
  if (value === null) throw new Error(`${path}: missing`);
  return value;
}

function parse<T>(contents: string, path: string): T {
  try { return JSON.parse(contents) as T; } catch { throw new Error(`${path}: invalid JSON`); }
}

function stringify(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }

function isIso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
}

function sameStrings(actual: unknown, expected: string[]): actual is string[] {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sameSet(actual: Iterable<string>, expected: ReadonlySet<string>): boolean {
  const values = new Set(actual);
  return values.size === expected.size && [...values].every((value) => expected.has(value));
}
