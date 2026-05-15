# DevByHwang Blog

Eleventy 3와 GitHub Pages로 운영하는 개인 블로그입니다. 하나의 코드베이스에서 두 브랜드를 함께 다룹니다.

- DevByHwang: 게임 데모, 개발 기록을 쌓아가는 DevByHwang 블로그.
- Underground Novel: 소설과 메모를 쌓아가는 글쓰기 공간.
- Playground: DevByHwang 전용 독립 실행형 데모 모음.

주요 언어는 한국어입니다. 코드는 MIT License, 콘텐츠는 CC BY-NC-SA 4.0 License를 따릅니다.

## Quick Start

요구사항:

- Node.js 22+
- npm

```bash
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:8080`에서 실행됩니다.

주요 명령:

```bash
npm run dev      # Eleventy 개발 서버
npm run build    # 프로덕션 빌드, 출력: _site/
npm run clean    # _site/ 삭제
```

## 프로젝트 구조

- `src/index.njk`: 브랜드 선택 허브 홈.
- `src/devbyhwang/`: DevByHwang 홈, 소개, 글 목록, 카테고리, Playground 목록.
- `src/devbyhwang/blog/`: DevByHwang 글 파일.
- `src/dodoes/`: Underground Novel 홈, 소개, 글 목록, 카테고리.
- `src/dodoes/writing/`: Underground Novel 글 파일.
- `src/demos/`: `/devbyhwang/playground/`로 복사되는 독립형 Playground 데모.
- `src/_includes/layouts/base.njk`: 공통 레이아웃, canonical, description, Open Graph, Twitter card, CSP.
- `src/_includes/layouts/devbyhwang-post.njk`: DevByHwang 글 상세 레이아웃.
- `src/_includes/layouts/dodoes-writing.njk`: Underground Novel 글 상세 레이아웃.
- `src/_includes/partials/`: 글 목록과 글 상세 공통 파셜.
- `src/_data/brands.js`: 브랜드 네비게이션, 테마, 설명, 광고 사용 여부.
- `src/_data/site.js`: 사이트 메타데이터, 소셜 링크, Google Ads 환경변수.
- `src/_data/studio.js`: Playground 카드와 DevByHwang 소개 데이터.
- `src/assets/`: 이미지, 아이콘, 공통 JS, Playground 광고 설정 템플릿.
- `src/styles/main.css`: 공통 스타일.
- `src/robots.txt.njk`: `/robots.txt` 생성.
- `src/sitemap.xml.njk`: `/sitemap.xml` 생성.
- `eleventy.config.js`: 컬렉션, 필터, passthrough copy, 출력 설정.

## 콘텐츠 작성

### DevByHwang 글

경로:

```text
src/devbyhwang/blog/YYYY-MM-DD-title.md
```

권장 front matter:

```md
---
layout: layouts/devbyhwang-post.njk
title: "Devlog #12 - 렌더링 최적화"
date: 2026-04-04
category: devlog
excerpt: "이번 주 렌더링 병목 분석과 수정 기록"
---

본문을 마크다운으로 작성합니다.
```

카테고리:

- `devlog`: 개발일지
- `info`: 정보글
- `freelance`: 외주
- `games`: 게임

### Underground Novel 글

경로:

```text
src/dodoes/writing/YYYY-MM-DD-title.md
```

권장 front matter:

```md
---
layout: layouts/dodoes-writing.njk
title: "첫 번째 노트"
date: 2026-04-04
category: notes
description: "짧은 메모 요약"
excerpt: "본문 일부 요약"
---

본문을 마크다운으로 작성합니다.
```

카테고리:

- `novel`: 소설
- `notes`: 노트

작성 메모:

- 필수 필드: `layout`, `title`, `date`, `category`
- `excerpt`는 글 목록 요약, SEO description, Open Graph description, Twitter description에 사용됩니다.
- `description`은 페이지/글별 보조 설명으로 사용할 수 있습니다.
- 카테고리 목록은 `eleventy.config.js`의 컬렉션과 `postsByCategory` 필터를 따릅니다.
- 이미지가 필요하면 `src/assets/`에 추가하고 사이트 경로 기준으로 참조합니다.

## SEO와 공유 미리보기

공통 SEO 메타는 `src/_includes/layouts/base.njk`에서 생성합니다.

- `<title>`은 페이지 `title`과 브랜드명을 조합합니다.
- `meta description`은 `excerpt -> description -> 브랜드 설명 -> 사이트 설명` 순서로 선택합니다.
- canonical URL은 `SITE_URL`과 Eleventy `page.url`을 기준으로 생성합니다.
- Open Graph 태그를 모든 페이지에 출력합니다: `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`.
- Twitter card 태그를 모든 페이지에 출력합니다: `twitter:card`, `twitter:title`, `twitter:description`.
- 글 상세 페이지의 `og:type`은 `article`, 일반 페이지는 `website`입니다.

검색 엔진 파일:

- `src/robots.txt.njk` -> `/robots.txt`
- `src/sitemap.xml.njk` -> `/sitemap.xml`
- `robots.txt`에는 `Sitemap: {SITE_URL}/sitemap.xml`이 포함됩니다.
- RSS/Atom feed는 현재 생성하지 않습니다.

## Playground 운영

Playground는 DevByHwang 브랜드의 독립형 데모 영역입니다.

- 목록 페이지: `/devbyhwang/playground/`
- 데모 파일: `src/demos/<slug>/index.html`
- 빌드 결과: `/devbyhwang/playground/<slug>/`
- 카드 데이터: `src/_data/studio.js`의 `games` 배열

현재 등록된 데모:

- Embercraft Fireplace: Three.js + Cannon.js 기반 실시간 장작불 시뮬레이션.
- 네모게임 (NEMO GAME): 100% 풀이 가능한 논리 퍼즐.

새 데모를 추가할 때는 `src/demos/<slug>/index.html`을 만들고 `src/_data/studio.js`에 카드 엔트리를 추가합니다. 자세한 규칙은 `src/demos/README.md`를 따릅니다.

## 광고와 환경변수

환경변수는 로컬 `.env` 또는 GitHub Actions 환경에서 읽습니다. `eleventy.config.js`가 `.env`를 로드하고, `src/_data/site.js`가 값을 정규화합니다.

| 변수 | 용도 | 기본값 |
| --- | --- | --- |
| `SITE_URL` | canonical, sitemap, robots.txt의 기준 URL | `http://localhost:8080` |
| `PATH_PREFIX` | GitHub Pages 하위 경로 배포 prefix | `/` |
| `GOOGLE_ADS_CLIENT` | Google AdSense client ID | 빈 값 |
| `GOOGLE_ADS_ENABLE` | 광고 활성화 여부, `true`일 때 활성 | `false` |
| `GOOGLE_ADS_SLOT_DEFAULT` | 기본 글/페이지 광고 슬롯 | 빈 값 |
| `GOOGLE_ADS_PLAYGROUND_BOTTOM_SLOT` | Playground 하단 광고 슬롯 | 빈 값 |

광고 동작:

- 공통 광고는 DevByHwang 브랜드에서만 사용합니다.
- 글 본문 inline 광고는 문단 수 기준으로 삽입됩니다.
- Playground 하단 광고 설정은 `/assets/playground-ad-config.json`으로 빌드됩니다.
- 광고 슬롯이 비어 있거나 `0000000000`이면 실제 광고 대신 placeholder 또는 비활성 상태로 처리합니다.

## CSP와 외부 리소스

기본 레이아웃은 GitHub Pages 환경을 고려해 `meta` 기반 CSP를 사용합니다.

- CDN 스크립트나 스타일을 추가하면 `src/_includes/layouts/base.njk`의 CSP 허용 목록을 확인합니다.
- 독립형 데모가 외부 CDN을 쓰는 경우, 해당 HTML의 CSP/SRI 적용 여부를 별도로 확인합니다.
- SRI가 필요한 CDN URL을 바꾸면 아래 명령으로 SHA-384 값을 다시 계산합니다.

```bash
curl -sL <cdn-url> | openssl dgst -sha384 -binary | openssl base64 -A
```

## GitHub Pages 배포

배포 워크플로우는 `.github/workflows/deploy.yml`입니다.

- `main` 브랜치 push 시 자동 배포합니다.
- `workflow_dispatch`로 수동 배포할 수 있습니다.
- GitHub Actions에서 Node.js 22와 `npm ci`를 사용합니다.
- 저장소명이 `*.github.io`이면 `PATH_PREFIX=/`로 설정합니다.
- 그 외 저장소는 `PATH_PREFIX=/<REPO_NAME>/`로 설정합니다.
- `SITE_URL`은 GitHub 저장소 owner/name 기준으로 자동 계산합니다.
- 빌드 산출물 `_site/`를 GitHub Pages artifact로 업로드합니다.

GitHub Settings > Pages에서 배포 소스가 GitHub Actions인지 확인하세요.

## 라이선스

- 코드: MIT License (`LICENSE`)
- 콘텐츠: CC BY-NC-SA 4.0 (`LICENSE-CONTENT`)

콘텐츠 라이선스 적용 범위:

- `src/devbyhwang/blog/**`
- `src/dodoes/writing/**`
- `src/demos/**`
- Playground 전용 자산: `src/assets/embercraft.js`, `src/assets/embercraft-preview.png`, `src/assets/nemo-game-preview.png`
- 프로필 이미지: `src/assets/profile.png`, `src/assets/dodoes-profile.png`

그 외 레이아웃, 템플릿, 스타일, 빌드 코드는 MIT License를 따릅니다. 제3자 라이브러리, 폰트, SDK는 각 원저작권과 라이선스가 우선합니다.

## 템플릿

이 저장소는 개인 블로그 운영용입니다. 레이아웃을 재사용해 새 블로그를 만들고 싶다면 별도 템플릿 저장소를 사용하세요.

- DevByHwang Blog Template: https://github.com/devbyhwang/devbyhwang-blog-template
