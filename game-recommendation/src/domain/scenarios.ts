import type { Query } from "./types";

export const SCENARIOS: { name: string; query: Query }[] = [
  { name: "혼자 · 2~3시간 · 힐링", query: { players: 1, length: "medium", viewerParticipation: false, vibe: "healing" } },
  { name: "혼자 · 짧게 · 소통위주", query: { players: 1, length: "short", viewerParticipation: false, vibe: "chatting" } },
  { name: "혼자 · 길게 · 빡겜", query: { players: 1, length: "long", viewerParticipation: false, vibe: "hardcore" } },
  { name: "혼자 · 2~3시간 · 볼거리", query: { players: 1, length: "medium", viewerParticipation: false, vibe: "spectacle" } },
  { name: "혼자 · 짧게 · 공포", query: { players: 1, length: "short", viewerParticipation: false, vibe: "horror" } },
  { name: "2인 · 2~3시간 · 예능", query: { players: 2, length: "medium", viewerParticipation: false, vibe: "variety" } },
  { name: "2인 · 길게 · 힐링", query: { players: 2, length: "long", viewerParticipation: false, vibe: "healing" } },
  { name: "4인 · 2~3시간 · 예능", query: { players: 4, length: "medium", viewerParticipation: false, vibe: "variety" } },
  { name: "4인 · 짧게 · 공포", query: { players: 4, length: "short", viewerParticipation: false, vibe: "horror" } },
  { name: "4인 · 길게 · 빡겜", query: { players: 4, length: "long", viewerParticipation: false, vibe: "hardcore" } },
  { name: "시청자 참여 · 2~3시간 · 소통위주", query: { players: 1, length: "medium", viewerParticipation: true, vibe: "chatting" } },
  { name: "시청자 참여 · 4인 · 예능", query: { players: 4, length: "medium", viewerParticipation: true, vibe: "variety" } },
];
