# Columbia blog (Eleventy + GitHub Pages)

개발 중인 게임, devlog, 외주 작업기, 일반 글을 올리는 정적 블로그 템플릿입니다. Eleventy로 빌드하고 GitHub Pages로 배포합니다.

## 빠른 시작
1. Node 18+ 설치
2. 의존성 설치: `npm install`
3. 개발 서버: `npm run dev` (http://localhost:8080)
4. 프로덕션 빌드: `npm run build` → 결과물은 `_site/`

## 글 작성 방법
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
- 목록/카테고리 페이지는 자동으로 갱신됩니다.

## 섹션 데이터 수정
- `src/_data/site.js`: 블로그 타이틀, 소개, 소셜 링크, Google Ads 설정
- `src/_data/studio.js`: 게임 카드, 외주 파이프라인, 콜아웃 문구
- 색상/레이아웃: `src/styles/main.css`

## Google Ads 추가
1. AdSense에서 발급받은 클라이언트 ID를 `src/_data/site.js`의 `googleAds.client`에 입력
2. `googleAds.enable`을 `true`로 변경
3. 광고 슬롯 ID를 바꾸고 싶다면 `src/_includes/ad-slot.njk`의 `data-ad-slot` 값을 수정
4. `ELEVENTY_ENV=production`에서만 스크립트가 로드되어 로컬 개발 시 경고가 없습니다.

## GitHub Pages 배포
- 워크플로우: `.github/workflows/deploy.yml`
- main 브랜치에 push하면 빌드 → Pages로 배포
- 기본값으로 `PATH_PREFIX="/${REPO_NAME}/"`를 넣어 프로젝트 페이지에 맞춰둠
  - 사용자/조직 페이지(`username.github.io`) 또는 커스텀 도메인을 쓸 때는
    - 워크플로우에서 `PATH_PREFIX`를 `/`로 변경하거나 제거하세요.
- GitHub Settings → Pages에서 배포 대상이 "GitHub Actions"인지 확인

## 구조
```
src/
  _data/        전역 데이터 (사이트 정보, 게임/외주 카드)
  _includes/    레이아웃과 광고 슬롯
  posts/        마크다운 포스트
  styles/       메인 스타일시트
  index.njk     홈
  blog.njk      블로그 리스트
```

필요한 섹션이나 스타일을 자유롭게 변경해도 Eleventy가 자동으로 정적 HTML을 생성합니다.
