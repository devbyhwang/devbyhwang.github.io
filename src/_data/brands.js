module.exports = {
  devbyhwang: {
    displayName: "DevByHwang",
    slug: "devbyhwang",
    tagline: "playground · devlog",
    description: "Playground와 개발 기록을 모아두는 개발자 블로그.",
    homeHref: "/devbyhwang/",
    nav: [
      { label: "홈", href: "/devbyhwang/" },
      { label: "소개", href: "/devbyhwang/about/", matchPrefix: "/devbyhwang/about/" },
      {
        label: "Playground",
        href: "/devbyhwang/playground/",
        matchPrefix: "/devbyhwang/playground/",
      },
      { label: "글", href: "/devbyhwang/blog/", matchPrefix: "/devbyhwang/blog/" },
    ],
    crossLink: {
      label: "Underground Novel",
      href: "/dodoes/",
    },
    themeClass: "theme-devbyhwang",
    features: {
      ads: true,
    },
  },
  dodoes: {
    displayName: "Underground Novel",
    slug: "dodoes",
    tagline: "",
    description: "소설과 메모를 쌓아가는 독자 공간.",
    homeHref: "/dodoes/",
    nav: [
      { label: "홈", href: "/dodoes/" },
      { label: "소개", href: "/dodoes/about/", matchPrefix: "/dodoes/about/" },
      { label: "글", href: "/dodoes/writing/", matchPrefix: "/dodoes/writing/" },
    ],
    crossLink: {
      label: "DevByHwang",
      href: "/devbyhwang/",
    },
    themeClass: "theme-dodoes",
    features: {
      ads: false,
    },
  },
};
