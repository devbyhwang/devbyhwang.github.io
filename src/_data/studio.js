module.exports = {
  games: [
    {
      title: "Starless Harbor",
      role: "Solo dev",
      status: "Prototype",
      blurb: "Lo-fi naval roguelite about charting ghost currents and negotiating with factions.",
      links: [{ label: "Devlog", href: "#blog" }, { label: "Build", href: "https://example.com" }],
      tags: ["unity", "roguelite", "PC"],
    },
    {
      title: "Mossglass",
      role: "Design / Code",
      status: "Alpha",
      blurb: "Cozy puzzle loops about restoring terrariums with procedural plants.",
      links: [{ label: "GIFs", href: "https://example.com" }],
      tags: ["godot", "puzzle", "mobile"],
    },
    {
      title: "Night Courier",
      role: "Producer",
      status: "Released",
      blurb: "Microhorror jam entry – first-person deliveries that unravel into folklore.",
      links: [{ label: "Play", href: "https://example.com" }],
      tags: ["unreal", "horror", "jam"],
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
    jobs: [
      {
        client: "Indie Studio A",
        work: "UI/UX overhaul + live ops HUD",
        year: "2025",
        status: "In progress",
        notes: "유니티 UI Toolkit 전환, 접근성 점검 포함.",
      },
      {
        client: "Agency B",
        work: "Playable ad / mini-game 제작",
        year: "2024",
        status: "Shipped",
        notes: "3주 내 런칭, 크로스 플랫폼 크리에이티브 AB 테스트 지원.",
      },
      {
        client: "Solo dev C",
        work: "컨설팅: 마켓 테스트 로드맵",
        year: "2024",
        status: "Completed",
        notes: "스팀 데모 → KPI 측정 → 퍼블리셔 미팅 준비.",
      },
    ],
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
