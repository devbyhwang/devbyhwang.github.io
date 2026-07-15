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
  title: "DevByHwang",
  tagline: "playground · devlog",
  description: "게임 데모, 개발 기록을 쌓아가는 DevByHwang 블로그.",
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
    sidebarDisplaySlot: normalizeAdSlot(env.GOOGLE_ADS_SLOT_SIDEBAR_DISPLAY || ""),
    railDisplaySlot: normalizeAdSlot(env.GOOGLE_ADS_SLOT_RAIL_DISPLAY || ""),
    inArticleSlot: normalizeAdSlot(env.GOOGLE_ADS_SLOT_IN_ARTICLE || ""),
    inFeedSlot: normalizeAdSlot(env.GOOGLE_ADS_SLOT_IN_FEED || ""),
    inFeedLayoutKey: normalizeAdSlot(env.GOOGLE_ADS_IN_FEED_LAYOUT_KEY || ""),
    multiplexSlot: normalizeAdSlot(env.GOOGLE_ADS_SLOT_MULTIPLEX || ""),
    playgroundBottomSlot: normalizeAdSlot(env.GOOGLE_ADS_PLAYGROUND_BOTTOM_SLOT || ""),
  },
  googleAnalytics: {
    measurementId: env.GOOGLE_ANALYTICS_ID || "G-F1FV4MKDPN",
  },
};
