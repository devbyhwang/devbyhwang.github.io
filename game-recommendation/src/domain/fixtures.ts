import { MS_PER_DAY } from "./constants";
import type { Catalog, Game, PlayerSource, SessionShape, VibeKey } from "./types";
import { VIBE_KEYS } from "./types";

const GENERATED_AT = "2026-01-01T00:00:00.000Z";

type Seed = {
  id: string;
  name: string;
  fr?: string;                       // franchise
  pMax: number | "unknown";
  pSrc?: PlayerSource;               // 기본 igdb_multiplayer
  online?: boolean;
  local?: boolean;
  shape: SessionShape;
  vp?: boolean;                      // viewerPlayable
  v: Partial<Record<VibeKey, number>>;
  viewers: number;
  channels: number;
  growth?: number | null;            // 배수. 1.0 = 변화 없음
  age: number;                       // 출시 후 경과일
  rating?: number;
  reviews?: number;
  app?: number;                      // Steam appid. 없으면 커버 없는 게임
};

const SEEDS: Seed[] = [
  // ── 힐링 ──
  { id: "g1", name: "Stardew Valley", pMax: 4, online: true, shape: "openended", v: { healing: 0.95, chatting: 0.7 }, viewers: 4200, channels: 180, growth: 1.0, age: 3200, rating: 92, reviews: 900, app: 413150 },
  { id: "g2", name: "Animal Crossing: New Horizons", pMax: 8, online: true, shape: "openended", v: { healing: 0.92, chatting: 0.65 }, viewers: 900, channels: 60, growth: 0.9, age: 2100, rating: 88, reviews: 400 },
  { id: "g3", name: "Dave the Diver", pMax: 1, shape: "run", v: { healing: 0.7, variety: 0.5, spectacle: 0.4 }, viewers: 1500, channels: 40, growth: 1.1, age: 900, rating: 90, reviews: 600, app: 1868140 },
  { id: "g4", name: "Unpacking", pMax: 1, shape: "chapter", v: { healing: 0.9, chatting: 0.6 }, viewers: 200, channels: 12, growth: 1.0, age: 1500, rating: 84, reviews: 200, app: 1135690 },

  // ── 예능 ──
  { id: "g5", name: "Lethal Company", pMax: 4, online: true, shape: "run", v: { variety: 0.95, horror: 0.75 }, viewers: 22000, channels: 700, growth: 1.2, age: 700, rating: 89, reviews: 1200, app: 1966720 },
  { id: "g6", name: "Fall Guys", pMax: 4, online: true, shape: "match", v: { variety: 0.85, spectacle: 0.5 }, viewers: 6000, channels: 320, growth: 0.95, age: 1900, rating: 78, reviews: 700, app: 1097150 },
  { id: "g7", name: "The Jackbox Party Pack 10", pMax: 8, online: true, shape: "match", vp: true, v: { variety: 0.9, chatting: 0.8 }, viewers: 800, channels: 25, growth: 1.0, age: 1000, rating: 80, reviews: 150, app: 2216530 },
  { id: "g8", name: "Overcooked! 2", fr: "Overcooked", pMax: 4, online: true, local: true, shape: "run", v: { variety: 0.8, hardcore: 0.4 }, viewers: 1100, channels: 55, growth: 1.0, age: 2400, rating: 82, reviews: 500, app: 728880 },
  { id: "g9", name: "Overcooked! All You Can Eat", fr: "Overcooked", pMax: 4, online: true, local: true, shape: "run", v: { variety: 0.78, hardcore: 0.42 }, viewers: 950, channels: 40, growth: 1.0, age: 1700, rating: 81, reviews: 300, app: 1243550 },
  { id: "g10", name: "Content Warning", pMax: 4, online: true, shape: "run", v: { variety: 0.9, horror: 0.6 }, viewers: 3000, channels: 90, growth: 2.6, age: 20, rating: 83, reviews: 220, app: 2881650 },

  // ── 공포 ──
  { id: "g11", name: "Phasmophobia", pMax: 4, online: true, shape: "run", v: { horror: 0.95, variety: 0.6 }, viewers: 9000, channels: 400, growth: 1.05, age: 1800, rating: 87, reviews: 1100, app: 739630 },
  { id: "g12", name: "Resident Evil 4", fr: "Resident Evil", pMax: 1, shape: "chapter", v: { horror: 0.85, spectacle: 0.7, hardcore: 0.5 }, viewers: 5000, channels: 150, growth: 1.0, age: 1100, rating: 93, reviews: 1500, app: 2050650 },
  { id: "g13", name: "The Outlast Trials", pMax: 4, online: true, shape: "run", v: { horror: 0.9, variety: 0.5 }, viewers: 1800, channels: 45, growth: 1.3, age: 400, rating: 82, reviews: 350, app: 1304930 },
  { id: "g14", name: "Buckshot Roulette", pMax: 1, shape: "match", v: { horror: 0.7, chatting: 0.6 }, viewers: 600, channels: 20, growth: 1.0, age: 300, rating: 85, reviews: 180, app: 2835570 },

  // ── 빡겜 ──
  { id: "g15", name: "Elden Ring", pMax: 1, shape: "openended", v: { hardcore: 0.95, spectacle: 0.85 }, viewers: 30000, channels: 900, growth: 1.0, age: 1400, rating: 95, reviews: 2000, app: 1245620 },
  { id: "g16", name: "Hades II", fr: "Hades", pMax: 1, shape: "run", v: { hardcore: 0.8, spectacle: 0.7 }, viewers: 7000, channels: 130, growth: 1.4, age: 200, rating: 92, reviews: 800, app: 1145350 },
  { id: "g17", name: "Dark Souls III", fr: "Dark Souls", pMax: 1, shape: "openended", v: { hardcore: 0.93, spectacle: 0.6 }, viewers: 2500, channels: 110, growth: 1.0, age: 3000, rating: 91, reviews: 1400, app: 374320 },
  { id: "g18", name: "Sekiro", pMax: 1, shape: "openended", v: { hardcore: 0.94, spectacle: 0.65 }, viewers: 2200, channels: 80, growth: 1.0, age: 2300, rating: 92, reviews: 1300, app: 814380 },
  { id: "g19", name: "Celeste", pMax: 1, shape: "chapter", v: { hardcore: 0.85, healing: 0.4 }, viewers: 700, channels: 30, growth: 1.0, age: 2800, rating: 91, reviews: 600, app: 504230 },

  // ── 소통위주 ──
  { id: "g20", name: "Vampire Survivors", pMax: 1, shape: "run", v: { chatting: 0.9, hardcore: 0.35 }, viewers: 1200, channels: 35, growth: 1.0, age: 1300, rating: 89, reviews: 900, app: 1794680 },
  { id: "g21", name: "Balatro", pMax: 1, shape: "run", v: { chatting: 0.85, hardcore: 0.5 }, viewers: 5500, channels: 120, growth: 1.6, age: 150, rating: 93, reviews: 1000, app: 2379780 },
  { id: "g22", name: "Minecraft", pMax: 8, online: true, shape: "openended", vp: true, v: { chatting: 0.8, healing: 0.6, spectacle: 0.4 }, viewers: 40000, channels: 1600, growth: 1.0, age: 5000, rating: 90, reviews: 3000 },
  { id: "g23", name: "PowerWash Simulator", pMax: 2, online: true, shape: "openended", v: { chatting: 0.9, healing: 0.75 }, viewers: 400, channels: 18, growth: 1.0, age: 1000, rating: 85, reviews: 300, app: 1290000 },

  // ── 볼거리 ──
  { id: "g24", name: "Black Myth: Wukong", pMax: 1, shape: "chapter", v: { spectacle: 0.95, hardcore: 0.8 }, viewers: 12000, channels: 260, growth: 1.8, age: 25, rating: 90, reviews: 1200, app: 2358720 },
  { id: "g25", name: "Cyberpunk 2077", pMax: 1, shape: "openended", v: { spectacle: 0.9, chatting: 0.4 }, viewers: 8000, channels: 300, growth: 1.0, age: 1600, rating: 88, reviews: 1800, app: 1091500 },

  // ── 시청자 참여 ──
  { id: "g28", name: "Among Us", pMax: 15, online: true, shape: "match", vp: true, v: { variety: 0.85, chatting: 0.6 }, viewers: 2400, channels: 95, growth: 1.0, age: 2600, rating: 85, reviews: 800, app: 945360 },
  { id: "g29", name: "Gartic Phone", pMax: 8, online: true, shape: "match", vp: true, v: { variety: 0.88, chatting: 0.75 }, viewers: 700, channels: 30, growth: 1.1, age: 1400, rating: 82, reviews: 210 },
  { id: "g30", name: "Marbles on Stream", pMax: 8, online: true, shape: "match", vp: true, v: { chatting: 0.85, variety: 0.6 }, viewers: 500, channels: 22, growth: 1.0, age: 2500, rating: 75, reviews: 130, app: 1030300 },
  { id: "g31", name: "skribbl.io", pMax: 8, online: true, shape: "match", vp: true, v: { chatting: 0.9, variety: 0.7 }, viewers: 420, channels: 16, growth: 1.0, age: 3100, rating: 80, reviews: 160 },

  // ── 인원 정보 결측 케이스 (unknown 처리 검증용) ──
  { id: "g26", name: "Indie Co-op Prototype", pMax: "unknown", pSrc: "unknown", shape: "run", v: { variety: 0.7, chatting: 0.55 }, viewers: 300, channels: 15, growth: null, age: 15, rating: 79, reviews: 60 },

  // ── 채널 수 부족 케이스 (MIN_CHANNELS 검증용) ──
  { id: "g27", name: "Tiny Horror Jam Game", pMax: 1, shape: "match", v: { horror: 0.8 }, viewers: 900, channels: 2, growth: null, age: 10, rating: 76, reviews: 55 },
];

function toGame(s: Seed): Game {
  const vibes = Object.fromEntries(
    VIBE_KEYS.map((k) => [k, s.v[k] ?? 0]),
  ) as Record<VibeKey, number>;

  const released = new Date(Date.now() - s.age * MS_PER_DAY).toISOString();

  return {
    id: s.id,
    name: s.name,
    franchise: s.fr,
    releaseDate: released,
    players: {
      max: s.pMax,
      source: s.pSrc ?? (s.pMax === "unknown" ? "unknown" : "igdb_multiplayer"),
      online: s.online ?? false,
      localCoop: s.local ?? false,
    },
    sessionShape: s.shape,
    viewerPlayable: s.vp
      ? { ok: true, reason: "커뮤니티 참여 방송으로 널리 쓰임" }
      : { ok: false },
    vibes,
    buzz: {
      twitchViewers: s.viewers,
      twitchChannels: s.channels,
      viewerGrowth7d: s.growth === undefined ? null : s.growth,
      isNewRelease: s.age <= 30,
    },
    streaming: {
      totalViewers: s.viewers,
      channelCount: s.channels,
      medianViewersPerChannel: null,
      p75ViewersPerChannel: null,
      top10ViewerShare: null,
      viewerConcentration: null,
      growth7d: s.growth === undefined ? null : s.growth,
      growth30d: null,
      growth90d: null,
      volatility30d: null,
      observedSnapshots: s.growth == null ? 0 : 7,
      coverage: 0,
      asOf: GENERATED_AT,
    },
    quality: {},
    topTags: [],
    rating: s.rating,
    reviewCount: s.reviews,
    steamAppId: s.app,
    coverUrl: s.app
      ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${s.app}/library_600x900.jpg`
      : undefined,
    storeUrl: s.app ? `https://store.steampowered.com/app/${s.app}/` : undefined,
  };
}

export const SAMPLE_CATALOG: Game[] = SEEDS.map(toGame);

export const SAMPLE_DATASET: Catalog = {
  generatedAt: GENERATED_AT,
  games: SAMPLE_CATALOG,
};
