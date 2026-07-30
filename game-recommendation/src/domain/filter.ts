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

  // ③ 분위기 — 근거 없는 게임은 탈락시킨다.
  //
  // ①의 인원 필터는 "정보 없음"을 통과시키지만 분위기는 다르다. 분위기는 사용자가
  // 명시적으로 고른 조건이고, 근거 없는 게임을 통과시킨 것이 2026-07 사고의 본질이었다.
  // (전역 min-max 정규화가 "태그 없음"을 healing 0.872로 만들어 카탈로그의 99.997%가
  // 힐링 조건을 통과했다.) 장르·테마·태그가 하나도 없으면 여섯 축이 모두 0이므로 여기서
  // 걸러진다. 결과가 적을 때는 완화 사다리가 임계값을 0.35로 낮추는 것이 올바른 밸브이며,
  // 근거가 0인 게임은 어느 임계값에서도 통과하지 않는다. 기본 통과로 되돌리지 말 것.
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
