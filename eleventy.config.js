const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");

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

module.exports = function (eleventyConfig) {
  loadEnv();
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
  const CATEGORY_LABELS = {
    devlog: "개발일지",
    freelance: "외주",
    games: "게임",
    notes: "노트",
    philosophy: "철학 노트",
  };
  const CATEGORY_ORDER = ["devlog", "freelance", "games", "notes", "philosophy"];
  const studio = require("./src/_data/studio");

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

  eleventyConfig.addCollection("posts", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/posts/**/*.{md,njk}")
      .sort((a, b) => b.date - a.date)
  );

  eleventyConfig.addCollection("philosophy", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/zarathustra/**/*.md")
      .sort((a, b) => b.date - a.date)
  );

  // Filter for main feed: includes posts and philosophy notes with showInMainFeed: true
  eleventyConfig.addCollection("mainFeed", (collectionApi) => {
    const posts = collectionApi.getFilteredByGlob("src/posts/**/*.{md,njk}");
    const philosophy = collectionApi
      .getFilteredByGlob("src/zarathustra/**/*.md")
      .filter((item) => item.data.showInMainFeed === true);
    return [...posts, ...philosophy].sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addFilter("head", (items, count) => {
    if (!Array.isArray(items)) return [];
    return items.slice(0, count);
  });

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  eleventyConfig.addCollection("popularPosts", (collectionApi) => {
    const posts = collectionApi.getFilteredByGlob("src/posts/**/*.{md,njk}");
    return posts
      .map((post) => {
        const views = toNumber(post.data.views);
        const rank = toNumber(post.data.popularRank);
        if (views !== null) return { post, score: views };
        if (rank !== null) return { post, score: rank };
        if (post.data.popular === true) return { post, score: 1 };
        return { post, score: 0 };
      })
      .sort((a, b) => b.score - a.score || b.post.date - a.post.date)
      .map(({ post }) => post);
  });

  const buildCategoryGroups = (collectionApi) => {
    const grouped = {};
    collectionApi.getFilteredByGlob("src/posts/**/*.{md,njk}").forEach((item) => {
      const category = item.data.category || "notes";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(item);
    });
    Object.keys(grouped).forEach((key) => grouped[key].sort((a, b) => b.date - a.date));
    return grouped;
  };

  eleventyConfig.addCollection("byCategory", (collectionApi) => buildCategoryGroups(collectionApi));

  eleventyConfig.addCollection("tagList", (collectionApi) => {
    const tagMap = new Map();
    const addTag = (tag) => {
      if (!tag) return;
      const name = String(tag).trim();
      if (!name) return;
      const slug = slugify(name);
      if (!slug || tagMap.has(slug)) return;
      tagMap.set(slug, name);
    };

    collectionApi.getFilteredByGlob("src/posts/**/*.{md,njk}").forEach((post) => {
      if (Array.isArray(post.data.tags)) {
        post.data.tags.forEach(addTag);
      }
      addTag(post.data.category);
    });

    collectionApi.getFilteredByGlob("src/zarathustra/**/*.md").forEach((note) => {
      if (Array.isArray(note.data.tags)) {
        note.data.tags.forEach(addTag);
      }
      addTag(note.data.category);
    });

    if (studio && Array.isArray(studio.games)) {
      studio.games.forEach((game) => {
        if (Array.isArray(game.tags)) {
          game.tags.forEach(addTag);
        }
        addTag(game.postCategory);
      });
    }

    if (studio && studio.freelance && Array.isArray(studio.freelance.jobs)) {
      studio.freelance.jobs.forEach((job) => {
        if (Array.isArray(job.tags)) {
          job.tags.forEach(addTag);
        }
        addTag(job.postCategory);
      });
    }

    return Array.from(tagMap, ([slug, name]) => ({ slug, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  });

  eleventyConfig.addCollection("categoryList", (collectionApi) => {
    const grouped = buildCategoryGroups(collectionApi);
    const keys = Object.keys(grouped);
    const orderedKeys = [
      ...CATEGORY_ORDER.filter((key) => keys.includes(key)),
      ...keys.filter((key) => !CATEGORY_ORDER.includes(key)).sort(),
    ];
    return orderedKeys.map((key) => ({
      key,
      name: CATEGORY_LABELS[key] || key,
      count: grouped[key].length,
    }));
  });

  eleventyConfig.addFilter("cardSlug", (item) => {
    if (!item) return "";
    if (item.slug) return item.slug;
    if (item.title) return slugify(item.title);
    if (item.client) return slugify(`${item.client} ${item.work || ""}`);
    return "";
  });

  eleventyConfig.addFilter("relatedPosts", (posts, card) => {
    if (!Array.isArray(posts) || !card) return [];
    const tags = Array.isArray(card.tags)
      ? card.tags.map((tag) => slugify(tag)).filter(Boolean)
      : [];
    const category = card.postCategory ? slugify(card.postCategory) : "";
    const results = [];
    const seen = new Set();
    posts.forEach((post) => {
      const postTags = Array.isArray(post.data.tags)
        ? post.data.tags.map((tag) => slugify(tag)).filter(Boolean)
        : [];
      const postCategory = post.data.category ? slugify(post.data.category) : "";
      const tagMatch = tags.length && postTags.length
        ? tags.some((tag) => postTags.includes(tag))
        : false;
      const categoryMatch = category ? postCategory === category : false;
      if ((tagMatch || categoryMatch) && !seen.has(post.url)) {
        results.push(post);
        seen.add(post.url);
      }
    });
    return results;
  });

  eleventyConfig.addFilter("postsByTag", (posts, tag) => {
    if (!Array.isArray(posts)) return [];
    const tagName = typeof tag === "string" ? tag : tag && (tag.slug || tag.name);
    const tagSlug = slugify(tagName);
    if (!tagSlug) return [];
    return posts.filter((post) => {
      const values = [];
      if (Array.isArray(post.data.tags)) values.push(...post.data.tags);
      if (post.data.category) values.push(post.data.category);
      return values.some((value) => slugify(value) === tagSlug);
    });
  });

  eleventyConfig.addFilter("cardsByTag", (cards, tag) => {
    if (!Array.isArray(cards)) return [];
    const tagName = typeof tag === "string" ? tag : tag && (tag.slug || tag.name);
    const tagSlug = slugify(tagName);
    if (!tagSlug) return [];
    return cards.filter((card) => {
      const values = [];
      if (Array.isArray(card.tags)) values.push(...card.tags);
      if (card.postCategory) values.push(card.postCategory);
      return values.some((value) => slugify(value) === tagSlug);
    });
  });

  eleventyConfig.addFilter("postsByCategory", (posts, category) => {
    if (!Array.isArray(posts)) return [];
    const categoryKey = typeof category === "string" ? category : category && category.key;
    if (!categoryKey) return [];
    return posts.filter((post) => {
      const postCategory = post.data.category || "notes";
      return postCategory === categoryKey;
    });
  });

  eleventyConfig.addFilter("cardsByCategory", (cards, category) => {
    if (!Array.isArray(cards)) return [];
    const categoryKey = typeof category === "string" ? category : category && category.key;
    if (!categoryKey) return [];
    return cards.filter((card) => {
      return card.postCategory === categoryKey;
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
