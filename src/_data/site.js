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
  title: "Auckland",
  tagline: "two blogs",
  description: "개발자 브랜드 DevByHwang와 작가 브랜드 Underground Novel를 위한 블로그.",
  author: "Hwang",
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
};
