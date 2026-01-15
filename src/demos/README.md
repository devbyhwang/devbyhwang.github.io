# Playground

Eleventy 블로그에 표시되는 Playground 작품 모음입니다.

## 새 데모 추가하기

1. **디렉토리 생성**
   ```bash
   mkdir -p src/demos/your-demo-name
   ```

2. **index.html 작성**
   - `_template.html`을 복사해서 시작
   - 모든 CSS/JS는 인라인이거나 상대 경로로 로드
   - `../../playground/` 백 링크 반드시 포함

3. **studio.js에 엔트리 추가**
   ```javascript
   {
     title: "Your Demo Name",
     role: "Playground",
     status: "Live",
     blurb: "한 줄 설명",
     links: [{ label: "Launch", href: "/demos/your-demo-name/" }],
     tags: ["webgl", "simulation"],
     type: "demo",
   }
   ```

4. **로컬 테스트**
   ```bash
   npm run dev
   # http://localhost:8080/demos/your-demo-name/ 확인
   ```

## 요구사항

- **반응형**: 모바일과 데스크톱 모두 작동
- **독립형**: 사이트 CSS/JS에 의존하지 않음
- **상대 경로**: PATH_PREFIX 호환을 위해 절대 경로 사용 금지
- **백 네비게이션**: `../../playground/` 링크 필수

## 카테고리별 태그

- `webgl` - Three.js/WebGL 데모
- `canvas` - Canvas 2D 데모
- `simulation` - 물리/파티클 시뮬레이션
- `creative-tool` - 창작 도구
- `game` - 미니게임/퍼즐
- `experimental` - 실험적 기술 데모

## 현재 Playground 목록

- **Embercraft Fireplace** - Three.js와 Cannon.js로 만든 실시간 장작불 시뮬레이션
