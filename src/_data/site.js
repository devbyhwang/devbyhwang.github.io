const normalizeUrl = (value) => {
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const toBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === "true";
};

const env = process.env;

module.exports = {
  title: "DevByHwang",
  tagline: "devlogs · freelance · notes",
  description:
    "개발자 Hwang의 개발 기록과 외주 로그, 기타 글을 모아둔 블로그.",
  author: "DevByHwang",
  url: normalizeUrl(env.SITE_URL || "http://localhost:8080"),
  email: "",
  socials: {
    github: "https://github.com/devbyhwang",
    kmong: "https://kmong.com/@DevByHwang",
    itch: "",
    youtube: "https://www.youtube.com/@DevByHwang",
    x: "",
  },
  googleAds: {
    // 설정 방법: Google AdSense 발급 후 클라이언트 ID를 입력, enable을 true로 설정
    client: env.GOOGLE_ADS_CLIENT || "",
    enable: toBool(env.GOOGLE_ADS_ENABLE, false),
  },
  visitorCounter: {
    enable: toBool(env.VISITOR_COUNTER_ENABLE, true),
    namespace: env.VISITOR_COUNTER_NAMESPACE || "devbyhwang-tel-aviv",
    totalKey: env.VISITOR_COUNTER_TOTAL_KEY || "total",
    dailyPrefix: env.VISITOR_COUNTER_DAILY_PREFIX || "daily",
    timeZone: env.VISITOR_COUNTER_TIMEZONE || "Asia/Seoul",
  },
  hero: {
    kicker: "Personal dev notes",
    heading: "작업 기록과 일상 노트를 차곡차곡 쌓아가는 곳",
    subhead:
      "프로젝트 진행 과정, 외주 경험, 개발 팁과 생각을 편하게 기록합니다.",
    actions: [
      { href: "/about/", label: "소개" },
      { href: "#blog", label: "최신 글" },
    ],
  },
};
