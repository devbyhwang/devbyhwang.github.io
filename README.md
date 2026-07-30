# DevByHwang Blog

Eleventy 3와 GitHub Pages로 운영하는 정적 사이트입니다. 하나의 코드베이스에서 DevByHwang 블로그와 DevByHwang Playground 데모를 함께 빌드합니다.

- DevByHwang: 게임 데모, 개발 기록을 쌓아가는 DevByHwang 블로그.
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

개발 서버는 기본적으로 `http://localhost:8080`에서 실행됩니다. 프로덕션 빌드는 `_site/`에 생성됩니다.

주요 명령:

```bash
npm run dev      # Eleventy 개발 서버
npm run build    # 프로덕션 빌드, 출력: _site/
npm run clean    # _site/ 삭제
npm test         # 게임 추천 앱 + 수집 파이프라인 테스트
npm run pipeline:fixture   # 네트워크 없는 fixture catalog 생성
npm run pipeline:validate  # 실데이터 catalog와 history 검증
npm run pipeline:backfill -- --start 1980-01-01 --end 2026-01-01  # 지정 기간 IGDB 역사 데이터 수집
```

## 프로젝트 구조

- `src/index.njk`: 홈 (Playground 하이라이트 + 최신 글).
- `src/about.njk`: 소개 페이지 (`/about/`).
- `src/posts.njk`: 글 아카이브 (`/posts/`).
- `src/category.njk`: 카테고리별 글 목록 (`/categories/<key>/`).
- `src/playground.njk`: Playground 목록 (`/playground/`).
- `src/blog/`: 글 파일. 빌드 URL은 `/posts/`.
- `src/playground/`: `/playground/`로 복사되는 독립형 Playground 데모.
- `game-recommendation/`: 게임 추천 Playground의 React/Vite 소스.
- `scripts/pipeline/`: Twitch·IGDB·Steam 기반 게임 추천 catalog 수집 파이프라인.
- `data/`: 게임 추천 knowledge, raw cache, history.
- `src/_includes/layouts/base.njk`: 공통 레이아웃, canonical, description, Open Graph, Twitter card, CSP.
- `src/_includes/layouts/post.njk`: 글 상세 레이아웃.
- `src/_includes/partials/`: 글 목록과 글 상세 공통 파셜.
- `src/_includes/ads/`: display, in-feed, multiplex 광고 파셜.
- `src/_data/site.js`: 사이트 메타데이터, 소셜 링크, Google Ads 환경변수.
- `src/_data/studio.js`: Playground 카드와 소개 데이터.
- `src/assets/`: 이미지, 아이콘, 공통 JS, Playground 광고 설정 템플릿.
- `src/styles/main.css`: 공통 스타일.
- `src/robots.txt.njk`: `/robots.txt` 생성.
- `src/sitemap.xml.njk`: `/sitemap.xml` 생성.
- `eleventy.config.js`: 컬렉션, 필터, passthrough copy, 출력 설정.

## 콘텐츠 작성

### 글

경로:

```text
src/blog/YYYY-MM-DD-title.md
```

빌드 URL:

```text
/posts/YYYY-MM-DD-title/
```

권장 front matter:

```md
---
layout: layouts/post.njk
title: "Devlog #12 - 렌더링 최적화"
date: 2026-04-04
category: devlog
excerpt: "이번 주 렌더링 병목 분석과 수정 기록"
---

본문을 마크다운으로 작성합니다.
```

AI 생성 글은 front matter에 `ai_generated: true`를 추가합니다. 생략하면 직접 작성 글로 처리합니다.

카테고리:

- `devlog`: 개발 일지
- `info`: 정보 글
- `freelance`: 외주
- `games`: 게임

작성 메모:

- 필수 필드: `layout`, `title`, `date`, `category`
- `excerpt`는 글 목록 요약, SEO description, Open Graph description, Twitter description에 사용됩니다.
- `excerpt`가 없으면 본문 첫 문단을 160자 기준으로 잘라 meta description에 사용합니다.
- 글 상세 헤더에는 기본적으로 `excerpt`를 표시하지 않습니다. `excerpt`는 부제목이 아니라 목록/검색/공유용 요약으로 관리합니다.
- `description`은 페이지/글별 보조 설명으로 사용할 수 있습니다.
- `ai_generated: true`를 설정하면 글 목록의 AI 글 토글과 글 상세의 AI 작성 도움 안내에 반영됩니다.
- 카테고리 목록과 페이지네이션은 `eleventy.config.js`의 컬렉션, `postsByCategory` 필터, `buildPaginatedArchive`를 따릅니다.
- 이미지가 필요하면 `src/assets/`에 추가하고 사이트 경로 기준으로 참조합니다.

## SEO와 공유 미리보기

공통 SEO 메타는 `src/_includes/layouts/base.njk`에서 생성합니다.

- `<title>`은 페이지 `title`과 사이트 제목을 조합합니다.
- `meta description`은 `excerpt -> description -> 본문 첫 문단 -> 사이트 설명` 순서로 선택합니다.
- canonical URL은 `SITE_URL`과 Eleventy `page.url`을 기준으로 생성합니다.
- Open Graph 태그를 모든 페이지에 출력합니다: `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`.
- Twitter card 태그를 모든 페이지에 출력합니다: `twitter:card`, `twitter:title`, `twitter:description`.
- 글 상세 페이지의 `og:type`은 `article`, 일반 페이지는 `website`입니다.
- 글 상세 본문의 `h1`~`h3`에는 자동 heading id가 붙고, 목차 UI에 사용됩니다.

검색 엔진 파일:

- `src/robots.txt.njk` -> `/robots.txt`
- `src/sitemap.xml.njk` -> `/sitemap.xml`
- `robots.txt`에는 `Sitemap: {SITE_URL}/sitemap.xml`이 포함됩니다.
- RSS/Atom feed는 현재 생성하지 않습니다.

## Playground 운영

Playground는 독립형 데모 영역입니다.

- 목록 페이지: `/playground/`
- 데모 파일: `src/playground/<slug>/index.html`
- 빌드 결과: `/playground/<slug>/`
- 카드 데이터: `src/_data/studio.js`의 `games` 배열

새 데모를 추가할 때는 `src/playground/<slug>/index.html`을 만들고 `src/_data/studio.js`에 카드 엔트리를 추가합니다. 자세한 규칙은 `src/playground/README.md`를 따릅니다.

## 광고와 환경변수

환경변수는 로컬 `.env` 또는 GitHub Actions 환경에서 읽습니다. `eleventy.config.js`가 루트 `.env`를 로드하고, `src/_data/site.js`와 `src/_data/env.js`가 값을 정규화합니다.

| 변수 | 용도 | 기본값 |
| --- | --- | --- |
| `SITE_URL` | canonical, sitemap, robots.txt의 기준 URL | `http://localhost:8080` |
| `PATH_PREFIX` | GitHub Pages 하위 경로 배포 prefix | `/` |
| `GOOGLE_ADS_CLIENT` | Google AdSense client ID | 빈 값 |
| `GOOGLE_ADS_ENABLE` | 광고 활성화 여부, `true`일 때 활성 | `false` |
| `GOOGLE_ADS_SLOT_DEFAULT` | display 광고 fallback 슬롯 | 빈 값 |
| `GOOGLE_ADS_SLOT_SIDEBAR_DISPLAY` | 홈/글 목록 sidebar display 광고 슬롯 | `GOOGLE_ADS_SLOT_DEFAULT` |
| `GOOGLE_ADS_SLOT_RAIL_DISPLAY` | 글 상세 좌우 rail display 광고 슬롯 | `GOOGLE_ADS_SLOT_DEFAULT` |
| `GOOGLE_ADS_SLOT_IN_ARTICLE` | 글 본문 중간 In-article 광고 슬롯 | 빈 값 |
| `GOOGLE_ADS_SLOT_IN_FEED` | 홈/글 목록 In-feed 광고 슬롯 | 빈 값 |
| `GOOGLE_ADS_IN_FEED_LAYOUT_KEY` | AdSense In-feed 코드의 `data-ad-layout-key` 값 | 빈 값 |
| `GOOGLE_ADS_SLOT_MULTIPLEX` | 글 상세 관련 글 아래 Multiplex 광고 슬롯 | 빈 값 |
| `GOOGLE_ADS_PLAYGROUND_BOTTOM_SLOT` | Playground 하단 display 광고 슬롯 | 빈 값 |
| `GOOGLE_ANALYTICS_ID` | Google Analytics 4 Measurement ID | `G-F1FV4MKDPN` |

게임 추천 pipeline 환경변수:

| 변수 | 용도 | 기본값 |
| --- | --- | --- |
| `TWITCH_CLIENT_ID` | Twitch/IGDB API client ID | 필수 |
| `TWITCH_CLIENT_SECRET` | Twitch app access token 발급용 secret | 필수 |
| `CHZZK_CLIENT_ID` | Chzzk Open API client ID | 선택 |
| `CHZZK_CLIENT_SECRET` | Chzzk Open API client secret | 선택 |
| `TWITCH_TOP_GAME_LIMIT` | Twitch 인기 게임 수집 개수 | `1000` |
| `TWITCH_STREAM_PAGE_LIMIT` | Twitch stream 페이지 제한 | `20` |
| `IGDB_RECENT_DAYS` | IGDB 최근 출시 게임 검색 기간 | `60` |
| `CHZZK_PAGE_LIMIT` | Chzzk live 페이지 제한 | `20` |
| `CHZZK_RETRY_LIMIT` | Chzzk API 요청 재시도 제한 | `3` |

광고 동작:

- `GOOGLE_ADS_ENABLE=true`이고 `GOOGLE_ADS_CLIENT`가 있을 때 AdSense 스크립트를 로드합니다.
- 광고는 `ELEVENTY_ENV=production`인 빌드에서만 실제로 렌더링됩니다. 개발 서버에서는 placeholder가 표시될 수 있습니다.
- Sidebar/rail display 광고는 전용 슬롯이 없으면 `GOOGLE_ADS_SLOT_DEFAULT`를 fallback으로 사용합니다.
- 글 본문 inline 광고는 In-article 전용 슬롯으로만 삽입됩니다. 8문단 이상이면 1개, 18문단 이상이면 2개까지 삽입됩니다.
- 홈/글 목록 feed에는 In-feed 전용 슬롯이 있을 때 글 목록 안에 광고를 삽입합니다.
- 글 상세 관련 글 아래에는 Multiplex 전용 슬롯이 있을 때 광고를 삽입합니다.
- Playground 하단 광고 설정은 `/assets/playground-ad-config.json`으로 빌드됩니다.
- GitHub Pages 배포에서는 `GOOGLE_ADS_CLIENT`가 workflow에 설정되어 있고, `GOOGLE_ADS_ENABLE`과 슬롯 값은 repository variables에서 읽습니다.
- 광고 슬롯이 비어 있거나 `0000000000`이면 해당 위치의 광고는 fallback, placeholder 또는 비활성 상태로 처리합니다.
- Google Analytics는 production 빌드에서만 로드합니다.

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

게임 추천 catalog 갱신 workflow도 이 저장소에서 매일 00:00 UTC에 실행됩니다.
처음 운영하기 전에 repository secrets에 `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`을 등록하고,
`Backfill game recommendation catalog` workflow를 먼저 수동 실행해 역사 데이터를 채우세요. 시작일은
`YYYY-MM-DD` 형식의 포함 범위이고 종료일은 제외 범위입니다. 백필은 연도 단위 파티션과
`data/checkpoints/igdb.json`으로 중단 후 재실행을 지원합니다. 이후
`Refresh game recommendation catalog`가 매일 실행되어 최신 스트리밍·평가 데이터를 갱신합니다. 수집 범위는
repository variables의 `TWITCH_TOP_GAME_LIMIT`, `TWITCH_STREAM_PAGE_LIMIT`, `IGDB_RECENT_DAYS`로
조정할 수 있으며 refresh workflow 기본값은 각각 `100`, `5`, `60`입니다.
Chzzk 수집을 사용하려면 refresh workflow secrets에 `CHZZK_CLIENT_ID`, `CHZZK_CLIENT_SECRET`을
등록하고, `CHZZK_PAGE_LIMIT`, `CHZZK_RETRY_LIMIT` repository variables로 범위를 조정할 수 있습니다.
두 Chzzk secret 중 하나라도 없으면 Chzzk 수집은 비활성화되며 Twitch 기반 refresh는 계속 성공합니다.

## 라이선스

- 코드: MIT License (`LICENSE`)
- 콘텐츠: CC BY-NC-SA 4.0 (`LICENSE-CONTENT`)

콘텐츠 라이선스 적용 범위:

- `src/blog/**`
- `src/playground/**`
- Playground 전용 자산: `src/assets/embercraft.js`, `src/assets/embercraft-preview.png`, `src/assets/nemo-game-preview.png`
- 프로필 이미지: `src/assets/profile.png`

그 외 레이아웃, 템플릿, 스타일, 빌드 코드는 MIT License를 따릅니다. 제3자 라이브러리, 폰트, SDK는 각 원저작권과 라이선스가 우선합니다.

## 템플릿

이 저장소는 개인 블로그 운영용입니다. 레이아웃을 재사용해 새 블로그를 만들고 싶다면 별도 템플릿 저장소를 사용하세요.

- DevByHwang Blog Template: https://github.com/devbyhwang/devbyhwang-blog-template
