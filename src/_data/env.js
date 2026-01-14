module.exports = {
  isProd: process.env.ELEVENTY_ENV === "production",
  pathPrefix: process.env.PATH_PREFIX || "/",
};
