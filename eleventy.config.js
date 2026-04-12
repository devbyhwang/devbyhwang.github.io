const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");

const DEV_BRAND = "devbyhwang";
const DODOES_BRAND = "dodoes";

const DEV_CATEGORY_LABELS = {
  devlog: "개발일지",
  info: "정보글",
  freelance: "외주",
  games: "게임",
};

const DODOES_CATEGORY_LABELS = {
  novel: "소설",
  notes: "노트",
};

const DEV_CATEGORY_ORDER = ["devlog", "info", "freelance", "games"];
const DODOES_CATEGORY_ORDER = ["novel", "notes"];

const loadEnv = () => {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
};

const slugify = (value) => {
  if (!value) return "";
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizePostPath = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+/g, "/");
};

const toSeedViews = (data) => {
  const payload = data && typeof data === "object" ? data : {};
  const views = toNumber(payload.views);
  if (views !== null) return views;
  return 0;
};

const jsonScript = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const shuffle = (items) => {
  const shuffled = Array.isArray(items) ? [...items] : [];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const INLINE_AD_DEFAULTS = {
  minParagraphs: 10,
  paragraphsPerAd: 10,
  maxAds: 3,
  scope: "devbyhwang-post",
};

const isValidAdSlot = (slot) => {
  if (typeof slot !== "string") return false;
  const normalized = slot.trim();
  return Boolean(normalized && normalized !== "0000000000");
};

const buildInlineAdMarkup = ({ isEnabled, client, slot, scope }) => {
  if (isEnabled) {
    return `
<div class="ad-shell ad-shell-inline" data-inline-ad-slot="1" data-inline-ad-scope="${scope}" aria-label="Advertisement">
  <ins
    class="adsbygoogle"
    style="display:block"
    data-ad-client="${client}"
    data-ad-slot="${slot}"
    data-ad-format="auto"
    data-full-width-responsive="true"
  ></ins>
</div>`;
  }

  return `
<div class="ad-shell ad-shell-inline" data-inline-ad-slot="1" data-inline-ad-scope="${scope}" aria-label="Advertisement">
  <div class="ad-placeholder">
    광고 영역 · Google AdSense client ID 설정 후 활성화됩니다.
  </div>
</div>`;
};

const injectInlineAds = (html, site, env, options = {}) => {
  if (typeof html !== "string" || !html.includes("</p>")) return html;

  const config = {
    ...INLINE_AD_DEFAULTS,
    ...(options && typeof options === "object" ? options : {}),
  };

  const minParagraphs = Number.isFinite(Number(config.minParagraphs))
    ? Math.max(1, Number(config.minParagraphs))
    : INLINE_AD_DEFAULTS.minParagraphs;
  const paragraphsPerAd = Number.isFinite(Number(config.paragraphsPerAd))
    ? Math.max(1, Number(config.paragraphsPerAd))
    : INLINE_AD_DEFAULTS.paragraphsPerAd;
  const maxAds = Number.isFinite(Number(config.maxAds))
    ? Math.max(1, Number(config.maxAds))
    : INLINE_AD_DEFAULTS.maxAds;
  const scope = typeof config.scope === "string" && config.scope.trim()
    ? config.scope.trim()
    : INLINE_AD_DEFAULTS.scope;

  const paragraphCount = (html.match(/<\/p>/gi) || []).length;
  if (paragraphCount < minParagraphs) return html;

  const targetAds = Math.min(maxAds, Math.floor(paragraphCount / paragraphsPerAd));
  if (targetAds < 1) return html;

  const positions = [];
  for (let i = 1; i <= targetAds; i += 1) {
    let position = Math.floor((i * paragraphCount) / (targetAds + 1));
    if (position < 1) position = 1;
    const previous = positions[positions.length - 1];
    if (previous && position <= previous) {
      position = previous + 1;
    }
    if (position > paragraphCount) break;
    positions.push(position);
  }
  if (!positions.length) return html;

  const defaultSlot = site && site.googleAds && typeof site.googleAds.defaultSlot === "string"
    ? site.googleAds.defaultSlot.trim()
    : "";
  const adMarkup = buildInlineAdMarkup({
    isEnabled: Boolean(
      site &&
      site.googleAds &&
      site.googleAds.enable &&
      site.googleAds.client &&
      env &&
      env.isProd &&
      isValidAdSlot(defaultSlot)
    ),
    client: (site && site.googleAds && site.googleAds.client) || "",
    slot: defaultSlot,
    scope,
  });
  const insertAfter = new Set(positions);

  let paragraphIndex = 0;
  return html.replace(/<\/p>/gi, (match) => {
    paragraphIndex += 1;
    if (!insertAfter.has(paragraphIndex)) return match;
    return `${match}${adMarkup}`;
  });
};

module.exports = function (eleventyConfig) {
  loadEnv();

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
  eleventyConfig.addPassthroughCopy({ "src/demos": "playground" });
  eleventyConfig.addPassthroughCopy({ "src/ads.txt": "ads.txt" });
  eleventyConfig.addWatchTarget("src/styles");
  eleventyConfig.addWatchTarget("src/demos");
  eleventyConfig.ignores.add("src/demos/**");

  eleventyConfig.addFilter("slugify", slugify);
  eleventyConfig.addFilter("readableDate", (dateObj, format = "yyyy.MM.dd") =>
    DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(format)
  );
  eleventyConfig.addFilter("isoDate", (dateObj) =>
    DateTime.fromJSDate(dateObj, { zone: "utc" }).toISODate()
  );
  eleventyConfig.addFilter("head", (items, count) => {
    if (!Array.isArray(items)) return [];
    return items.slice(0, count);
  });
  eleventyConfig.addFilter("postViewSeed", (input) => {
    if (input && input.data) return toSeedViews(input.data);
    return toSeedViews(input);
  });
  eleventyConfig.addFilter("postViewCandidates", (posts) => {
    if (!Array.isArray(posts)) return [];
    return posts.map((post) => ({
      url: post.url || "",
      postKey: normalizePostPath(post.url || ""),
      title: (post.data && post.data.title) || "",
      seedViews: toSeedViews(post.data),
      dateMs: post.date instanceof Date ? post.date.getTime() : 0,
    }));
  });
  eleventyConfig.addFilter("jsonScript", (value) => jsonScript(value));
  eleventyConfig.addFilter("injectInlineAds", (html, site, env, options = {}) =>
    injectInlineAds(html, site, env, options)
  );

  const getDevPosts = (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/devbyhwang/blog/**/*.{md,njk}")
      .filter((item) => (item.data.brand || DEV_BRAND) === DEV_BRAND)
      .sort((a, b) => b.date - a.date);

  const getDodoesWriting = (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/dodoes/writing/**/*.{md,njk}")
      .filter((item) => (item.data.brand || DODOES_BRAND) === DODOES_BRAND)
      .sort((a, b) => b.date - a.date);

  const buildCategoryList = (items, order, labels, defaultKey) => {
    const grouped = {};

    order.forEach((key) => {
      grouped[key] = [];
    });

    items.forEach((item) => {
      const key = item.data.category || defaultKey;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    return [...order, ...Object.keys(grouped).filter((key) => !order.includes(key)).sort()].map(
      (key) => ({
        key,
        name: labels[key] || key,
        count: grouped[key] ? grouped[key].length : 0,
      })
    );
  };

  eleventyConfig.addCollection("devPosts", (collectionApi) => getDevPosts(collectionApi));
  eleventyConfig.addCollection("posts", (collectionApi) => getDevPosts(collectionApi));
  eleventyConfig.addCollection("dodoesWriting", (collectionApi) => getDodoesWriting(collectionApi));

  eleventyConfig.addCollection("devPopularPosts", (collectionApi) =>
    getDevPosts(collectionApi)
      .map((post) => ({
        post,
        score: toNumber(post.data.views) || 0,
      }))
      .sort((a, b) => b.score - a.score || b.post.date - a.post.date)
      .map(({ post }) => post)
  );

  eleventyConfig.addCollection("dodoesPopularPosts", (collectionApi) =>
    getDodoesWriting(collectionApi)
      .map((post) => ({
        post,
        score: toNumber(post.data.views) || 0,
      }))
      .sort((a, b) => b.score - a.score || b.post.date - a.post.date)
      .map(({ post }) => post)
  );

  eleventyConfig.addCollection("devCategoryList", (collectionApi) =>
    buildCategoryList(
      getDevPosts(collectionApi),
      DEV_CATEGORY_ORDER,
      DEV_CATEGORY_LABELS,
      "devlog"
    )
  );

  eleventyConfig.addCollection("dodoesCategoryList", (collectionApi) =>
    buildCategoryList(
      getDodoesWriting(collectionApi),
      DODOES_CATEGORY_ORDER,
      DODOES_CATEGORY_LABELS,
      "notes"
    )
  );

  eleventyConfig.addFilter("postsByCategory", (posts, category) => {
    if (!Array.isArray(posts)) return [];
    const categoryKey = typeof category === "string" ? category : category && category.key;
    if (!categoryKey) return [];
    return posts.filter((post) => {
      const fallback = post.data.brand === DODOES_BRAND ? "notes" : "devlog";
      return (post.data.category || fallback) === categoryKey;
    });
  });

  eleventyConfig.addFilter("hybridRelatedPosts", (posts, currentUrl, limit = 4) => {
    if (!Array.isArray(posts)) return [];
    const normalizedCurrentUrl = normalizePostPath(currentUrl);
    if (!normalizedCurrentUrl) return [];

    const maxItems = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : 4;
    if (maxItems < 1) return [];

    const currentIndex = posts.findIndex(
      (post) => normalizePostPath(post && post.url) === normalizedCurrentUrl
    );
    if (currentIndex === -1) return [];

    const toPath = (post) => normalizePostPath(post && post.url);
    const prevPost = posts[currentIndex + 1] || null;
    const nextPost = posts[currentIndex - 1] || null;

    const excluded = new Set([normalizedCurrentUrl]);
    [prevPost, nextPost].forEach((post) => {
      const pathKey = toPath(post);
      if (pathKey) excluded.add(pathKey);
    });

    const randomPool = shuffle(
      posts.filter((post) => {
        const pathKey = toPath(post);
        return pathKey && !excluded.has(pathKey);
      })
    );

    const usedPaths = new Set([normalizedCurrentUrl]);
    const results = [];
    let randomIndex = 0;

    const pushUnique = (post, role) => {
      if (!post) return false;
      const pathKey = toPath(post);
      if (!pathKey || usedPaths.has(pathKey)) return false;
      usedPaths.add(pathKey);
      results.push({ post, role });
      return true;
    };

    const pickRandom = () => {
      while (randomIndex < randomPool.length) {
        const candidate = randomPool[randomIndex];
        randomIndex += 1;
        if (pushUnique(candidate, "random")) return true;
      }
      return false;
    };

    if (!pushUnique(prevPost, "prev")) {
      pickRandom();
    }

    if (results.length < maxItems && !pushUnique(nextPost, "next")) {
      pickRandom();
    }

    while (results.length < maxItems && pickRandom()) {}

    return results;
  });

  eleventyConfig.addFilter("sitemapFilter", (items) => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      if (!item || !item.url) return false;
      if (item.data && item.data.sitemap === false) return false;
      if (item.url === "/sitemap.xml" || item.url === "/robots.txt") return false;
      return true;
    });
  });

  const pathPrefix = process.env.PATH_PREFIX || "/";

  return {
    pathPrefix,
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    dataTemplateEngine: "njk",
  };
};
