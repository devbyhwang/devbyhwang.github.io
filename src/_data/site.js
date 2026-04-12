const normalizeUrl = (value) => {
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const toBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === "true";
};

const normalizeAdSlot = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const env = process.env;

module.exports = {
  title: "",
  tagline: "",
  description: "개발자 브랜드 DevByHwang와 작가 브랜드 Underground Novel를 위한 블로그.",
  author: "Hwang",
  url: normalizeUrl(env.SITE_URL || "http://localhost:8080"),
  email: "devbyhwang@gmail.com",
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
    defaultSlot: normalizeAdSlot(env.GOOGLE_ADS_SLOT_DEFAULT || ""),
    playgroundBottomSlot: normalizeAdSlot(env.GOOGLE_ADS_PLAYGROUND_BOTTOM_SLOT || ""),
  },
  visitorCounter: {
    enable: toBool(env.VISITOR_COUNTER_ENABLE, true),
    namespace: env.VISITOR_COUNTER_NAMESPACE || "devbyhwang-tel-aviv",
    totalKey: env.VISITOR_COUNTER_TOTAL_KEY || "total",
    dailyPrefix: env.VISITOR_COUNTER_DAILY_PREFIX || "daily",
    timeZone: env.VISITOR_COUNTER_TIMEZONE || "Asia/Seoul",
  },
  postViews: {
    enable: toBool(env.POST_VIEWS_ENABLE, true),
    namespace: env.POST_VIEWS_NAMESPACE || "devbyhwang-post-views",
    counterPrefix: env.POST_VIEWS_COUNTER_PREFIX || "pv",
    timeZone: env.POST_VIEWS_TIMEZONE || "Asia/Seoul",
  },
};
