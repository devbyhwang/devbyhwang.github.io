// createdAt은 각 playground가 처음 추가된 날짜(YYYY-MM-DD)입니다.
// 목록은 createdAt 내림차순(최신 순)으로 노출되며, 같은 날짜면 아래 작성 순서를 유지합니다.
const games = [
  {
    title: "Embercraft Fireplace",
    createdAt: "2026-05-16",
    blurb: "Three.js와 Cannon.js로 만든 실시간 장작불 시뮬레이션. 물리 기반 파티클, 동적 오디오, 절차적 불꽃 생성.",
    links: [
      { label: "Launch", href: "/playground/embercraft/" },
    ],
    preview: "/assets/embercraft-preview.png",
  },
  {
    title: "네모게임 (NEMO GAME)",
    createdAt: "2026-05-16",
    blurb: "100% 풀이 가능한 논리 퍼즐. 역설계 맵 생성과 기하학 알고리즘으로 완벽한 해결 보장.",
    links: [
      { label: "Play", href: "/playground/nemo-game/" },
    ],
    preview: "/assets/nemo-game-preview.png",
  },
  {
    title: "PDF OCR Extractor",
    createdAt: "2026-05-16",
    blurb: "PDF와 이미지 파일에서 텍스트를 인식하고 이메일, 전화번호, 날짜, 금액 같은 데이터를 자동으로 정리하는 브라우저 도구.",
    links: [
      { label: "Extract", href: "/playground/ocr-extractor/" },
    ],
    preview: "/assets/ocr-extractor-preview.svg",
  },
  {
    title: "Focus Timer",
    createdAt: "2026-05-27",
    blurb: "구글 타이머 느낌으로 빠르게 시작하고, 완료 시 알림과 아이콘 카운트다운까지 제공하는 집중 타이머.",
    links: [
      { label: "Start", href: "/playground/focus-timer/" },
    ],
    preview: "/assets/focus-timer-preview.svg",
  },
  {
    title: "Local LLM Chat",
    createdAt: "2026-05-24",
    blurb: "시작 버튼만 누르면 브라우저에서 바로 써보는 가벼운 로컬 AI 채팅 playground.",
    links: [
      { label: "Launch", href: "/playground/local-llm/" },
    ],
    preview: "/assets/local-llm-preview.svg",
  },
  {
    title: "YOLO Label Editor",
    createdAt: "2026-06-10",
    blurb: "브라우저에서 이미지와 YOLO 라벨 좌표 txt 파일을 함께 열고 bbox 확인, 수정, ZIP 다운로드까지 처리하는 라벨 편집기.",
    links: [
      { label: "Edit", href: "/playground/yolo-labeling/" },
    ],
    preview: "/assets/yolo-labeling-preview.svg",
  },
  {
    title: "오늘 뭐 켜지? · Mohaji",
    createdAt: "2026-08-10",
    blurb: "방송 시간, 함께할 인원, 원하는 분위기를 고르면 지금 켜기 좋은 게임을 추천합니다.",
    links: [
      {
        label: "추천 시작",
        href: "https://mohaji-ci1.pages.dev/",
        external: true,
      },
    ],
  },
];

const toTime = (value) => {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
};

module.exports = {
  games: [...games].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt)),
};
