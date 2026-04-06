const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");

const DEV_BRAND = "devbyhwang";
const DODOES_BRAND = "dodoes";

const DEV_CATEGORY_LABELS = {
  devlog: "개발일지",
  freelance: "외주",
  games: "게임",
};

const DODOES_CATEGORY_LABELS = {
  novel: "소설",
  notes: "노트",
};

const DEV_CATEGORY_ORDER = ["devlog", "freelance", "games"];
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

module.exports = function (eleventyConfig) {
  loadEnv();

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
  eleventyConfig.addPassthroughCopy({ "src/demos": "playground" });
  eleventyConfig.addPassthroughCopy({ "src/ads.txt": "ads.txt" });
  eleventyConfig.addWatchTarget("src/styles");
  eleventyConfig.addWatchTarget("src/demos");

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
      .map((post) => {
        const views = toNumber(post.data.views);
        const rank = toNumber(post.data.popularRank);
        if (views !== null) return { post, score: views };
        if (rank !== null) return { post, score: rank };
        if (post.data.popular === true) return { post, score: 1 };
        return { post, score: 0 };
      })
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
