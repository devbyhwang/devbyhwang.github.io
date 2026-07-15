const path = require("path");

const fileNameSlug = (data) => {
  const inputPath = data && data.page && data.page.inputPath;
  if (!inputPath) return data && data.page ? data.page.fileSlug : "";
  return path.basename(inputPath, path.extname(inputPath));
};

module.exports = {
  eleventyComputed: {
    permalink: (data) => `/posts/${fileNameSlug(data)}/`,
  },
};
