# DevByHwang Blog (Eleventy + GitHub Pages)

DevByHwang와 Underground Novel 두 브랜드를 함께 운영하는 Eleventy 블로그입니다.
주요 언어는 한국어이며, GitHub Pages로 배포합니다.
코드는 MIT, 콘텐츠는 CC BY-NC-SA 4.0 라이선스를 따릅니다.

## 소개
- DevByHwang: 개발 기록, 실험, 외주 워크플로우
- Underground Novel: 소설/노트 중심의 글
- Playground: 독립 실행형 데모 모음

## 프로젝트 구조
- `src/devbyhwang/`: DevByHwang 페이지와 글 목록 템플릿
- `src/devbyhwang/blog/`: DevByHwang 글 파일(`.md`/`.njk`)
- `src/dodoes/`: Underground Novel 페이지와 글 목록 템플릿
- `src/dodoes/writing/`: Underground Novel 글 파일(`.md`/`.njk`)
- `src/demos/`: Playground 데모 정적 파일(빌드 시 `/devbyhwang/playground/`로 복사)
- `src/_data/studio.js`: Playground 카드, 소개 카드 데이터
- `src/_data/brands.js`: 브랜드 네비게이션/테마 설정
- `src/styles/main.css`: 공통 스타일
- `eleventy.config.js`: 컬렉션/필터/출력 설정

## Quick Start
1. Node.js 22+ 설치 (배포 워크플로우와 동일)
2. 의존성 설치: `npm install`
3. 개발 서버: `npm run dev` (http://localhost:8080)
4. 프로덕션 빌드: `npm run build` (출력 경로: `_site/`)

## 콘텐츠 작성
### 1) DevByHwang 글
- 경로: `src/devbyhwang/blog/YYYY-MM-DD-title.md`
- 참고: `src/devbyhwang/blog/` 디렉터리가 없다면 먼저 생성한 뒤 글 파일을 추가하세요.
- 레이아웃: `layouts/devbyhwang-post.njk`
- 기본 카테고리: `devlog` (`devlog | info | freelance | games` 권장)

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

### 2) Underground Novel 글
- 경로: `src/dodoes/writing/YYYY-MM-DD-title.md`
- 레이아웃: `layouts/dodoes-writing.njk`
- 기본 카테고리: `notes` (`novel | notes` 권장)

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

### 작성 메모
- front matter 필수 필드: `layout`, `title`, `date`, `category`
- front matter 선택 필드:
  - Dev 글: `excerpt`
  - Writing 글: `description`, `excerpt`
- 카테고리별 목록 페이지는 `eleventy.config.js` 컬렉션 규칙을 따릅니다.
- 이미지가 있다면 `src/assets/`에 추가 후 글에서 상대/절대 경로를 일관되게 사용하세요.

## Playground 운영
- 데모 파일 경로: `src/demos/<slug>/index.html`
- 카드 데이터: `src/_data/studio.js`의 `games` 배열에서 `type: "demo"`
- 현재 등록 데모:
  - Embercraft Fireplace (`/devbyhwang/playground/embercraft/`)
  - 네모게임 (NEMO GAME) (`/devbyhwang/playground/nemo-game/`)
  - 소설 작성 어시스턴트 (`/devbyhwang/playground/novel-assistant/`)

### LLM 데모 보안 원칙
- GitHub Pages 리포지토리/정적 코드에 API 키를 저장하지 않습니다.
- 브라우저에서 직접 LLM API를 호출하지 않고, 별도 프록시 서버(예: Cloudflare Workers)를 통해 호출합니다.
- 프록시 서버에만 서버 키를 저장하고, CORS Origin 제한 + Turnstile 검증을 적용합니다.
- rate limit은 KV 대신 Durable Object 등 원자적 카운터로 강제합니다.

### CSP/SRI 운영 메모
- 주요 페이지는 `meta` 기반 CSP를 사용합니다(GitHub Pages 환경).
- 고정 CDN 스크립트는 SRI(`integrity`)를 유지합니다.
- CDN URL을 변경하면 아래 명령으로 SHA-384를 다시 계산해 `integrity` 값을 갱신하세요.
  - `curl -sL <cdn-url> | openssl dgst -sha384 -binary | openssl base64 -A`

## GitHub Pages 배포
- 워크플로우: `.github/workflows/deploy.yml`
- `main` 브랜치 push 시 빌드 후 Pages 배포
- `PATH_PREFIX`는 워크플로우에서 자동 계산됩니다.
  - 저장소명이 `*.github.io`면 `PATH_PREFIX=/`
  - 그 외에는 `PATH_PREFIX=/<REPO_NAME>/`
- `SITE_URL`도 워크플로우에서 리포지토리 기준으로 자동 설정됩니다.
- GitHub Settings > Pages에서 배포 소스가 GitHub Actions인지 확인하세요.

## 라이선스
- 코드: MIT License (`LICENSE`)
- 콘텐츠: CC BY-NC-SA 4.0 (`LICENSE-CONTENT`)
- 콘텐츠 경로는 `LICENSE-CONTENT`의 Scope를 따릅니다.
  - 포함: `src/devbyhwang/blog/**`, `src/dodoes/writing/**`, `src/demos/**`
  - 포함: Playground 전용 자산(`src/assets/embercraft.js`, `src/assets/novel-assistant.js`, `src/assets/*-preview.png`, `src/assets/profile.jpg`, `src/assets/dodoes-profile.png`)
- 그 외 레이아웃/테마/템플릿/빌드/워커를 포함한 코드성 파일은 MIT를 따릅니다.
- 제3자 라이브러리/폰트/SDK 등은 각 원저작권 및 원라이선스가 우선합니다.

## 기여
- 오타 수정, 빌드/설정 개선, 문서 개선 PR을 환영합니다.
- 상세 가이드는 `CONTRIBUTING.md`를 참고하세요.
