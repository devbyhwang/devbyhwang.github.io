module.exports = {
  games: [
    {
      title: "Embercraft Fireplace",
      role: "Playground",
      status: "Live",
      blurb: "Three.js와 Cannon.js로 만든 실시간 장작불 시뮬레이션. 물리 기반 파티클, 동적 오디오, 절차적 불꽃 생성.",
      links: [
        { label: "Launch", href: "/playground/embercraft/" },
      ],
      postCategory: "games",
      tags: ["webgl", "physics", "simulation"],
      type: "demo",
      preview: "/assets/embercraft-preview.png",
    },
    {
      title: "네모게임 (NEMO GAME)",
      slug: "nemo-game",
      role: "Playground",
      status: "Live",
      blurb: "100% 풀이 가능한 논리 퍼즐. 역설계 맵 생성과 기하학 알고리즘으로 완벽한 해결 보장.",
      links: [
        { label: "Play", href: "/playground/nemo-game/" },
      ],
      postCategory: "games",
      tags: ["canvas", "game", "puzzle", "algorithm", "geometry"],
      type: "demo",
    },
  ],
  freelance: {
    summary: [
      {
        title: "리서치",
        detail: "클라이언트 목표, KPI, 제작 범위를 빠르게 정리하고 원페이지 제안서 작성.",
      },
      {
        title: "프로덕션",
        detail: "주간 스프린트로 태스크를 쪼개고, Figma/Notion 보드로 상태 공유.",
      },
      {
        title: "핸드오프",
        detail: "빌드/소스/가이드 문서를 깔끔하게 정리해 전달하고 피드백 라운드 진행.",
      },
    ],
    jobs: [],
  },
  callouts: [
    {
      title: "Devlog",
      body: "빌드 깨진 이유, 툴링 팁, 실패한 시도까지 솔직하게.",
    },
    {
      title: "Freelance",
      body: "클라이언트 워크플로우와 체크리스트를 투명하게 기록.",
    },
    {
      title: "Writing",
      body: "게임 외에도 창업/생활 글과 잡담을 아카이브.",
    },
  ],
};
