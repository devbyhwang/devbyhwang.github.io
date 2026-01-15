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
