# DevByHwang Blog (Eleventy + GitHub Pages)

A personal Eleventy blog for devlogs, freelance notes, and misc writing.
Primary language: Korean.
Code is MIT licensed; content is CC BY-NC-SA 4.0.

## 소개
개발 기록, 외주 로그, 게임 제작, 기타 글을 정리하는 개인 블로그입니다.
Eleventy로 빌드해 GitHub Pages로 배포합니다.

## 주요 섹션
- 글: `src/posts/`
- Playground: `src/_data/studio.js`의 `games` 중 `type: demo`
- 프로젝트/외주 카드: `src/_data/studio.js`
- 디자인/레이아웃: `src/styles/main.css`

## 빠른 시작
1. Node 18+ 설치
2. 의존성 설치: `npm install`
3. 개발 서버: `npm run dev` (http://localhost:8080)
4. 프로덕션 빌드: `npm run build` → 결과물은 `_site/`

## 글 작성 규칙
- 위치: `src/posts/YYYY-MM-DD-title.md`
- 프론트매터 예시:
  ```md
  ---
  layout: layouts/post.njk
  title: "Devlog #12 - 바다 셰이더"
  category: devlog   # devlog | freelance | games | notes 등
  readingTime: 4 min
  excerpt: "한 주 동안의 렌더링 개선 기록"
  views: 350         # (선택) 조회수 기반 인기순 정렬에 사용
  popularRank: 120   # (선택) 조회수 데이터가 없을 때 수동 우선순위
  ---
  본문을 마크다운으로 작성합니다.
  ```
- 태그(`tags`)는 선택이며, 카테고리는 자동으로 태그 목록에도 포함됩니다.

## 운영 메모
- 글/이미지 출처가 필요한 경우 본문 하단에 명시합니다.
- 개인 의견/회고 성격의 글은 외부 수정 제안을 받지 않습니다.
- 설정 변경은 `src/_data/site.js`, 카드/섹션 구성은 `src/_data/studio.js`에서 관리합니다.

## 라이선스
- 코드: MIT License (`LICENSE`)
- 콘텐츠(글/이미지): CC BY-NC-SA 4.0 (`LICENSE-CONTENT`)

## GitHub Pages 배포
- 워크플로우: `.github/workflows/deploy.yml`
- main 브랜치에 push하면 빌드 → Pages로 배포
- 기본값으로 `PATH_PREFIX="/${REPO_NAME}/"`를 넣어 프로젝트 페이지에 맞춰둠
  - 사용자/조직 페이지(`username.github.io`) 또는 커스텀 도메인을 쓸 때는
    - 워크플로우에서 `PATH_PREFIX`를 `/`로 변경하거나 제거하세요.
- GitHub Settings → Pages에서 배포 대상이 "GitHub Actions"인지 확인

## 기여
오타 수정/버그 제보/간단한 개선 PR은 환영합니다.
자세한 규칙은 `CONTRIBUTING.md`를 참고하세요.

## 변경 기록
- 2026-01-16: 코드 MIT / 콘텐츠 CC BY-NC-SA 4.0 / 기여 오픈으로 정리
