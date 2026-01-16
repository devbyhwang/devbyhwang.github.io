const studio = require("./studio");

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

const buildGameCards = () =>
  studio.games.map((game) => {
    const isDemo = game.type === "demo";
    const type = isDemo ? "playground" : "project";
    return {
      slug: game.slug || slugify(game.title),
      type,
      typeLabel: isDemo ? "Playground" : "프로젝트",
      backHref: isDemo ? "/playground/" : "/projects/",
      title: game.title,
      subtitle: game.role,
      role: game.role,
      status: game.status,
      description: game.blurb,
      preview: game.preview,
      tags: Array.isArray(game.tags) ? game.tags : [],
      links: Array.isArray(game.links) ? game.links : [],
      postCategory: game.postCategory || "games",
    };
  });

const buildFreelanceCards = () =>
  studio.freelance.jobs.map((job) => ({
    slug: job.slug || slugify(`${job.client} ${job.work || ""}`),
    type: "freelance",
    typeLabel: "외주",
    backHref: "/freelance/",
    title: job.client,
    subtitle: job.work,
    work: job.work,
    status: job.status,
    year: job.year,
    description: job.notes || job.work,
    notes: job.notes,
    tags: Array.isArray(job.tags) ? job.tags : ["freelance"],
    links: Array.isArray(job.links) ? job.links : [],
    postCategory: job.postCategory || "freelance",
  }));

module.exports = [...buildGameCards(), ...buildFreelanceCards()];
