import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./styles.css";

const queryClient = new QueryClient();

// 大きいモニターでつけっぱなしにする時用 (?zoom=2&theme=dark)。zoom は rem を大きくする
const params = new URLSearchParams(location.search);
const zoom = Number(params.get("zoom"));
if (zoom >= 0.5 && zoom <= 4) document.documentElement.style.fontSize = `${16 * zoom}px`;
const theme = params.get("theme");
if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );
}
