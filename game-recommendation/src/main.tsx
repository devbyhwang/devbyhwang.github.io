import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadRecommendations } from "./data/recommendations";
import { App } from "./ui/App";

const root = createRoot(document.getElementById("root")!);

function CatalogError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="app">
      <p>카탈로그를 불러오지 못했습니다</p>
      <button type="button" onClick={onRetry}>재시도</button>
    </main>
  );
}

function renderRecommendations() {
  root.render(
    <main className="app">
      <p>추천 결과를 불러오는 중입니다</p>
    </main>,
  );
  loadRecommendations()
    .then((index) => {
      root.render(
        <StrictMode>
          <App index={index} />
        </StrictMode>,
      );
    })
    .catch(() => {
      root.render(<CatalogError onRetry={renderRecommendations} />);
    });
}

renderRecommendations();
