import { SESSION_FIT, VIBE_THRESHOLD_BASE } from "./constants";
import type { Game, Query } from "./types";

export type FilterOptions = {
  vibeThreshold: number;
  allowRejectedSession: boolean;
  requireViewerPlayable: boolean;
};

export type FilteredGame = { game: Game; marginalSession: boolean };

export type FilterResult = {
  passed: FilteredGame[];
  counts: Record<"total" | "players" | "viewerPlayable" | "vibe" | "session", number>;
};

export function baseOptions(query: Query): FilterOptions {
  return {
    vibeThreshold: VIBE_THRESHOLD_BASE,
    allowRejectedSession: false,
    requireViewerPlayable: query.viewerParticipation,
  };
}

export function filterGames(
  catalog: Game[],
  query: Query,
  opts: FilterOptions,
): FilterResult {
  const counts = {
    total: catalog.length,
    players: 0,
    viewerPlayable: 0,
    vibe: 0,
    session: 0,
  };

  // ① 인원 — unknown은 통과 (조용한 탈락을 만들지 않는다)
  const afterPlayers = catalog.filter(
    (g) => g.players.max === "unknown" || g.players.max >= query.players,
  );
  counts.players = afterPlayers.length;

  // ② 시청자 참여
  const afterViewer = opts.requireViewerPlayable
    ? afterPlayers.filter((g) => g.viewerPlayable.ok)
    : afterPlayers;
  counts.viewerPlayable = afterViewer.length;

  // ③ 분위기
  const afterVibe = afterViewer.filter(
    (g) => g.vibes[query.vibe] >= opts.vibeThreshold,
  );
  counts.vibe = afterVibe.length;

  // ④ 세션 형태 × 방송 길이
  const passed: FilteredGame[] = [];
  for (const game of afterVibe) {
    const fit = SESSION_FIT[game.sessionShape][query.length];
    if (fit === "ok") passed.push({ game, marginalSession: false });
    else if (fit === "marginal") passed.push({ game, marginalSession: true });
    else if (opts.allowRejectedSession) passed.push({ game, marginalSession: true });
  }
  counts.session = passed.length;

  return { passed, counts };
}
