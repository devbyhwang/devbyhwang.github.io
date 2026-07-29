import {
  type ExplorationCard,
  type ExplorationManifest,
  type ExplorationPage,
  type ExplorationView,
} from "../domain/exploration";
import { recommendationKey } from "../domain/recommendation-index";
import type { Query } from "../domain/types";

type PageResult = {
  manifest: ExplorationManifest;
  cards: ExplorationCard[];
  hasMore: boolean;
};

const caches = new WeakMap<typeof fetch, Map<string, Promise<unknown>>>();

function cardShardFor(id: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % 64;
}

function cachedJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  let cache = caches.get(fetcher);
  if (!cache) {
    cache = new Map();
    caches.set(fetcher, cache);
  }
  const existing = cache.get(url) as Promise<T> | undefined;
  if (existing) return existing;

  const request = fetcher(url).then(async (response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json() as Promise<T>;
  });
  cache.set(url, request);
  request.catch(() => cache?.delete(url));
  return request;
}

function queryRoot(query: Query): string {
  return `./exploration/queries/${recommendationKey(query)}`;
}

function validateManifest(value: unknown): asserts value is ExplorationManifest {
  const manifest = value as ExplorationManifest;
  if (!manifest || typeof manifest !== "object" || !Number.isInteger(manifest.gameCount)
    || !Number.isInteger(manifest.pageSize) || manifest.pageSize !== 24 || !manifest.views) {
    throw new Error("exploration manifest: invalid");
  }
}

function validatePage(value: unknown): asserts value is ExplorationPage {
  if (!value || typeof value !== "object" || !Array.isArray((value as ExplorationPage).ids)
    || (value as ExplorationPage).ids.some((id) => typeof id !== "string")) {
    throw new Error("exploration page: invalid");
  }
}

function validateCards(value: unknown): asserts value is ExplorationCard[] {
  if (!Array.isArray(value) || value.some((card) => !card || typeof card.id !== "string" || typeof card.name !== "string")) {
    throw new Error("exploration cards: invalid");
  }
}

export async function loadCards(ids: string[], fetcher: typeof fetch = fetch): Promise<ExplorationCard[]> {
  const idsByShard = new Map<number, string[]>();
  for (const id of ids) {
    const shard = cardShardFor(id);
    const shardIds = idsByShard.get(shard) ?? [];
    shardIds.push(id);
    idsByShard.set(shard, shardIds);
  }
  const shards = await Promise.all([...idsByShard.keys()].map(async (shard) => {
    const cards = await cachedJson<unknown>(`./exploration/cards/${shard.toString().padStart(2, "0")}.json`, fetcher);
    validateCards(cards);
    return cards;
  }));
  const cardsById = new Map(shards.flat().map((card) => [card.id, card]));
  return ids.map((id) => {
    const card = cardsById.get(id);
    if (!card) throw new Error(`exploration cards: missing ${id}`);
    return card;
  });
}

export async function loadExplorationPage(
  query: Query,
  view: ExplorationView,
  page: number,
  fetcher: typeof fetch = fetch,
): Promise<PageResult> {
  const root = queryRoot(query);
  const manifest = await cachedJson<unknown>(`${root}/manifest.json`, fetcher);
  validateManifest(manifest);
  const count = manifest.views[view];
  if (!Number.isInteger(count) || count < 0) throw new Error(`exploration manifest: invalid ${view} count`);
  if (count === 0) return { manifest, cards: [], hasMore: false };
  const pageData = await cachedJson<unknown>(`${root}/${view}/${page}.json`, fetcher);
  validatePage(pageData);
  const cards = await loadCards(pageData.ids, fetcher);
  return { manifest, cards, hasMore: (page + 1) * manifest.pageSize < count };
}
