import {
  COMPACT_EXPLORATION_FORMAT,
  PAGE_SIZE,
  assertCompactExplorationCardOrdinal,
  compactExplorationCardPathForOrdinal,
  compactExplorationManifestPath,
  compactExplorationMembershipPath,
  compactExplorationRankPath,
  decodeMembershipBitset,
  decodeOrdinalRankVector,
  membershipBitsetByteLength,
  membershipBitsetHas,
  ordinalCardShard,
  type CompactExplorationCard,
  type CompactExplorationManifest,
  type ExplorationCard,
  type ExplorationView,
  type FilteredExplorationView,
} from "../domain/exploration";
import { recommendationKey } from "../domain/recommendation-index";
import type { Query } from "../domain/types";

type PageResult = {
  manifest: CompactExplorationManifest;
  cards: CompactExplorationCard[];
  hasMore: boolean;
};

const caches = new WeakMap<typeof fetch, Map<string, Promise<unknown>>>();
const FILTERED_VIEWS: readonly FilteredExplorationView[] = ["new", "rising", "discovery", "classic"];

function cacheFor(fetcher: typeof fetch): Map<string, Promise<unknown>> {
  let cache = caches.get(fetcher);
  if (!cache) { cache = new Map(); caches.set(fetcher, cache); }
  return cache;
}

function cached<T>(url: string, fetcher: typeof fetch, read: (response: Response) => Promise<T>): Promise<T> {
  const cache = cacheFor(fetcher);
  const existing = cache.get(url) as Promise<T> | undefined;
  if (existing) return existing;
  const request = fetcher(url).then(async (response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return read(response);
  });
  cache.set(url, request);
  request.catch(() => cache.delete(url));
  return request;
}

function cachedJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  return cached(url, fetcher, (response) => response.json() as Promise<T>);
}

function cachedBytes(url: string, fetcher: typeof fetch): Promise<Uint8Array> {
  return cached(url, fetcher, async (response) => new Uint8Array(await response.arrayBuffer()));
}

function asset(path: string): string { return `./${path}`; }
function queryKey(query: Query): string { return recommendationKey(query); }
function manifestUrl(query: Query): string { return asset(compactExplorationManifestPath(queryKey(query))); }

function isFilteredView(view: ExplorationView): view is FilteredExplorationView {
  return FILTERED_VIEWS.includes(view as FilteredExplorationView);
}

function validateManifest(value: unknown, key: string): asserts value is CompactExplorationManifest {
  const manifest = value as CompactExplorationManifest;
  if (!manifest || typeof manifest !== "object"
    || manifest.format !== COMPACT_EXPLORATION_FORMAT
    || typeof manifest.generatedAt !== "string"
    || !Number.isInteger(manifest.gameCount) || manifest.gameCount < 0
    || manifest.pageSize !== PAGE_SIZE
    || !manifest.rank || manifest.rank.path !== compactExplorationRankPath(key)
    || !Number.isInteger(manifest.rank.ordinalCount) || manifest.rank.ordinalCount < 0
    || manifest.rank.byteLength !== manifest.rank.ordinalCount * 4
    || !manifest.views || typeof manifest.views !== "object") throw new Error("exploration manifest: invalid");
  for (const view of FILTERED_VIEWS) {
    const descriptor = manifest.views[view];
    if (!descriptor || descriptor.path !== compactExplorationMembershipPath(key, view)
      || !Number.isInteger(descriptor.count) || descriptor.count < 0
      || descriptor.byteLength !== membershipBitsetByteLength(manifest.gameCount)) {
      throw new Error(`exploration manifest: invalid ${view}`);
    }
  }
}

function validateCard(value: unknown, gameCount: number, expectedShard: number): asserts value is CompactExplorationCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("exploration cards: invalid");
  const card = value as CompactExplorationCard;
  if (typeof card.id !== "string" || !card.id || typeof card.name !== "string" || !card.name
    || typeof card.releaseDate !== "string" || !card.players || typeof card.players !== "object"
    || (card.players.max !== "unknown" && (!Number.isInteger(card.players.max) || card.players.max < 1))
    || typeof card.players.online !== "boolean" || typeof card.players.localCoop !== "boolean"
    || !["match", "run", "chapter", "openended"].includes(card.sessionShape)
    || typeof card.twitchViewers !== "number" || !Number.isFinite(card.twitchViewers) || card.twitchViewers < 0
    || (card.discountPercent !== undefined && (typeof card.discountPercent !== "number" || card.discountPercent < 0 || card.discountPercent > 100))
    || (card.nameKo !== undefined && typeof card.nameKo !== "string")
    || (card.coverUrl !== undefined && typeof card.coverUrl !== "string")
    || (card.storeUrl !== undefined && typeof card.storeUrl !== "string")) throw new Error("exploration cards: invalid");
  try { assertCompactExplorationCardOrdinal(card, gameCount); } catch { throw new Error("exploration cards: invalid ordinal"); }
  if (ordinalCardShard(card.ordinal) !== expectedShard) throw new Error("exploration cards: wrong shard ordinal");
}

async function loadManifest(query: Query, fetcher: typeof fetch): Promise<CompactExplorationManifest> {
  const key = queryKey(query);
  const value = await cachedJson<unknown>(manifestUrl(query), fetcher);
  validateManifest(value, key);
  return value;
}

async function loadRank(manifest: CompactExplorationManifest, fetcher: typeof fetch): Promise<number[]> {
  const value = await cachedBytes(asset(manifest.rank.path), fetcher);
  return decodeOrdinalRankVector(value, manifest.rank.ordinalCount, manifest.gameCount);
}

async function selectedOrdinals(manifest: CompactExplorationManifest, view: ExplorationView, fetcher: typeof fetch): Promise<number[]> {
  if (isFilteredView(view) && manifest.views[view].count === 0) return [];
  const rank = await loadRank(manifest, fetcher);
  if (!isFilteredView(view)) return rank;
  const descriptor = manifest.views[view];
  const bits = decodeMembershipBitset(await cachedBytes(asset(descriptor.path), fetcher), manifest.gameCount);
  const ranked = new Set(rank);
  let memberCount = 0;
  for (let ordinal = 0; ordinal < manifest.gameCount; ordinal += 1) {
    if (!membershipBitsetHas(bits, ordinal, manifest.gameCount)) continue;
    memberCount += 1;
    if (!ranked.has(ordinal)) throw new Error(`exploration membership: ${view} outside rank`);
  }
  if (memberCount !== descriptor.count) throw new Error(`exploration membership: ${view} count mismatch`);
  const selected = rank.filter((ordinal) => membershipBitsetHas(bits, ordinal, manifest.gameCount));
  if (selected.length !== memberCount) throw new Error(`exploration membership: ${view} rank mismatch`);
  return selected;
}

export async function loadCards(ordinals: number[], gameCount: number, fetcher: typeof fetch = fetch): Promise<CompactExplorationCard[]> {
  const shards = new Map<number, number[]>();
  for (const ordinal of ordinals) {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= gameCount) throw new Error("exploration cards: invalid requested ordinal");
    const shard = ordinalCardShard(ordinal);
    shards.set(shard, [...(shards.get(shard) ?? []), ordinal]);
  }
  const loaded = await Promise.all([...shards.keys()].map(async (shard) => {
    const value = await cachedJson<unknown>(asset(compactExplorationCardPathForOrdinal(shard)), fetcher);
    if (!Array.isArray(value)) throw new Error("exploration cards: invalid shard");
    value.forEach((card) => validateCard(card, gameCount, shard));
    return value as CompactExplorationCard[];
  }));
  const byOrdinal = new Map<number, CompactExplorationCard>();
  for (const card of loaded.flat()) {
    if (byOrdinal.has(card.ordinal)) throw new Error(`exploration cards: duplicate ordinal ${card.ordinal}`);
    byOrdinal.set(card.ordinal, card);
  }
  return ordinals.map((ordinal) => {
    const card = byOrdinal.get(ordinal);
    if (!card) throw new Error(`exploration cards: missing ordinal ${ordinal}`);
    return card;
  });
}

export async function loadExplorationPage(query: Query, view: ExplorationView, page: number, fetcher: typeof fetch = fetch): Promise<PageResult> {
  if (!Number.isInteger(page) || page < 0) throw new Error("exploration page: invalid");
  const manifest = await loadManifest(query, fetcher);
  const all = await selectedOrdinals(manifest, view, fetcher);
  const start = page * PAGE_SIZE;
  const ordinals = all.slice(start, start + PAGE_SIZE);
  return { manifest, cards: await loadCards(ordinals, manifest.gameCount, fetcher), hasMore: start + PAGE_SIZE < all.length };
}

export type { ExplorationCard };
