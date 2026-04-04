# Playground

Eleventy 사이트의 `/playground/`에 노출되는 독립형 데모 모음입니다.

## 새 데모 추가하기

1. **디렉터리 생성**
   ```bash
   mkdir -p src/demos/your-demo-name
   ```

2. **`index.html` 작성**
   - `src/demos/_template.html`을 복사해 시작
   - 데모는 사이트 전역 CSS/JS에 의존하지 않도록 구성
   - 데모 내부 리소스는 상대 경로 기반으로 작성
   - `../` 백 링크를 포함해 Playground 목록으로 복귀 가능하게 유지

3. **`studio.js`에 카드 엔트리 추가** (`src/_data/studio.js`)
   ```js
   {
     title: "Your Demo Name",
     role: "Playground",
     status: "Live",
     blurb: "한 줄 설명",
     links: [{ label: "Launch", href: "/playground/your-demo-name/" }],
     tags: ["canvas", "game"],
     type: "demo",
     preview: "/assets/your-demo-preview.png",
   }
   ```

4. **로컬 확인**
   ```bash
   npm run dev
   # http://localhost:8080/playground/your-demo-name/
   ```

## 요구사항
- **반응형**: 모바일/데스크톱 모두 동작
- **독립형**: 데모 단독으로 실행 가능
- **PATH_PREFIX 호환**: 절대 경로 하드코딩 지양, 상대 경로 우선
- **백 네비게이션**: `../` 링크 유지

## 태그 예시
- `webgl` - Three.js/WebGL
- `canvas` - Canvas 2D
- `simulation` - 물리/파티클
- `game` - 미니게임/퍼즐
- `experimental` - 실험적 데모

## 현재 Playground 목록
- **Embercraft Fireplace** - Three.js + Cannon.js 기반 실시간 장작불 시뮬레이션
- **네모게임 (NEMO GAME)** - 100% 풀이 가능한 논리 퍼즐
