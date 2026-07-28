import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadCatalog } from "./data/catalog";
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

function renderCatalog() {
  loadCatalog()
    .then((catalog) => {
      root.render(
        <StrictMode>
          <App catalog={catalog} />
        </StrictMode>,
      );
    })
    .catch(() => {
      root.render(<CatalogError onRetry={renderCatalog} />);
    });
}

renderCatalog();
