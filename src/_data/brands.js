module.exports = {
  devbyhwang: {
    displayName: "DevByHwang",
    slug: "devbyhwang",
    tagline: "playground · devlog",
    description: "게임 데모, 개발 기록을 쌓아가는 DevByHwang 블로그.",
    homeHref: "/devbyhwang/",
    icon: {
      title: "/assets/icons/devbyhwang-icon.png",
      favicon16: "/assets/icons/devbyhwang-16x16.png",
      favicon32: "/assets/icons/devbyhwang-32x32.png",
      favicon512: "/assets/icons/devbyhwang-512x512.png",
      appleTouch: "/assets/icons/devbyhwang-180x180.png",
      tile: "/assets/icons/devbyhwang-192x192.png",
    },
    nav: [
      { label: "홈", href: "/devbyhwang/" },
      { label: "소개", href: "/devbyhwang/about/", matchPrefix: "/devbyhwang/about/" },
      {
        label: "Playground",
        href: "/devbyhwang/playground/",
        matchPrefix: "/devbyhwang/playground/",
      },
      { label: "글", href: "/devbyhwang/posts/", matchPrefix: "/devbyhwang/posts/" },
    ],
    themeClass: "theme-devbyhwang",
    features: {
      ads: true,
    },
  },
};
