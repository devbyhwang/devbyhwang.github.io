const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
  eleventyConfig.addPassthroughCopy({ "src/demos": "demos" });
  eleventyConfig.addWatchTarget("src/styles");
  eleventyConfig.addWatchTarget("src/demos");

  eleventyConfig.addFilter("readableDate", (dateObj, format = "yyyy.MM.dd") =>
    DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(format)
  );

  eleventyConfig.addCollection("posts", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/posts/**/*.{md,njk}")
      .sort((a, b) => b.date - a.date)
  );

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
