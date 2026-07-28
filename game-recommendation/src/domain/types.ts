export const VIBE_KEYS = [
  "healing", "variety", "horror", "hardcore", "chatting", "spectacle",
] as const;
export type VibeKey = (typeof VIBE_KEYS)[number];

export const VIBE_LABELS: Record<VibeKey, string> = {
  healing: "힐링",
  variety: "예능",
  horror: "공포",
  hardcore: "빡겜",
  chatting: "소통위주",
  spectacle: "볼거리",
};

export const LENGTH_LABELS: Record<LengthBucket, string> = {
  short: "~1.5시간",
  medium: "2~3시간",
  long: "4시간+",
};

export const PLAYER_LABELS: Record<number, string> = {
  1: "혼자",
  2: "2명",
  3: "3명",
  4: "4명",
  5: "5명+",
};

export type SessionShape = "match" | "run" | "chapter" | "openended";

/** 세션 형태를 사용자에게 보여줄 한 줄 설명. UI와 domain(why.ts)에서 공유한다. */
export const SESSION_TEXT: Record<SessionShape, string> = {
  match: "한 판 5~20분",
  run: "한 판 20~60분",
  chapter: "챕터 단위 1~3시간",
  openended: "아무 때나 끊기 좋음",
};

export type LengthBucket = "short" | "medium" | "long";
export type PlayerSource =
  | "igdb_multiplayer" | "igdb_gamemodes" | "steam_categories" | "unknown";

export type Game = {
  id: string;
  steamAppId?: number;
  name: string;
  nameKo?: string;
  franchise?: string;
  coverUrl?: string;
  storeUrl?: string;
  releaseDate: string;
  players: {
    max: number | "unknown";
    source: PlayerSource;
    online: boolean;
    localCoop: boolean;
  };
  sessionShape: SessionShape;
  viewerPlayable: { ok: boolean; reason?: string };
  vibes: Record<VibeKey, number>;
  buzz: {
    twitchViewers: number;
    twitchChannels: number;
    viewerGrowth7d: number | null;
    isNewRelease: boolean;
  };
  topTags: { tag: string; share: number }[];
  discountPercent?: number;
  rating?: number;
  reviewCount?: number;
};

export type Query = {
  length: LengthBucket;
  players: number;              // 1~5, 5는 "5인 이상"
  viewerParticipation: boolean;
  vibe: VibeKey;
};

export type Relaxation = "vibeThreshold" | "sessionShape" | "viewerPlayable";

/**
 * 결과가 0일 때 사용자에게 알릴 수 있는 원인.
 *
 * viewerPlayable·session이 없는 이유: blockedBy를 계산하는 시점에는
 * 완화 사다리가 이미 세 칸을 모두 내려가 requireViewerPlayable=false,
 * allowRejectedSession=true인 상태다. 두 조건은 그 시점에 아무도 거르지 않으므로
 * 원인이 될 수 없다. 다시 추가하지 말 것.
 *
 * "other" = 필터는 통과했으나 랭킹·슬롯 배정에서 아무도 살아남지 못함.
 * 어느 조건 탓인지 알 수 없으므로 아는 척하지 않는다.
 */
export type BlockedBy = "players" | "vibe" | "other";

export type WhyKind =
  | "opportunity" | "topOnTwitch" | "growth"
  | "newRelease" | "playerFit" | "sessionFit";

/** 점수 한 항의 기여도. contribution은 최종 score에 더해진 실제 값(음수 가능). */
export type ScoreTerm = { kind: WhyKind; raw: number; contribution: number };

export type Scored = {
  game: Game;
  score: number;
  terms: ScoreTerm[];
  marginalSession: boolean;
};

export type SlotKind = "safe" | "rising" | "new";

export type WhyPart = { kind: WhyKind; text: string };

export type Pick = {
  slot: SlotKind;
  game: Game;
  score: number;
  why: WhyPart[];
  terms: ScoreTerm[];        // 디버그 뷰용 전체 항
};

export type Catalog = {
  generatedAt: string;
  games: Game[];
};

export type Recommendation = {
  picks: Pick[];
  relaxations: Relaxation[];
  candidateCount: number;    // 최종 사용된 필터 단계의 통과 게임 수
  /** 결과가 0일 때 후보를 없앤 필터 단계. 결과가 있으면 null */
  blockedBy: BlockedBy | null;
};
