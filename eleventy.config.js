const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
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
  const studio = require("./src/_data/studio");

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
  eleventyConfig.addPassthroughCopy({ "src/demos": "demos" });
  eleventyConfig.addWatchTarget("src/styles");
  eleventyConfig.addWatchTarget("src/demos");

  eleventyConfig.addFilter("slugify", slugify);

  eleventyConfig.addFilter("readableDate", (dateObj, format = "yyyy.MM.dd") =>
    DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(format)
  );

  eleventyConfig.addCollection("posts", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/posts/**/*.{md,njk}")
      .sort((a, b) => b.date - a.date)
  );

  eleventyConfig.addCollection("byCategory", (collectionApi) => {
    const grouped = {};
    collectionApi.getFilteredByGlob("src/posts/**/*.{md,njk}").forEach((item) => {
      const category = item.data.category || "notes";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(item);
    });
    Object.keys(grouped).forEach((key) => grouped[key].sort((a, b) => b.date - a.date));
    return grouped;
  });

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
