import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./styles.css";

const queryClient = new QueryClient();

// 大きいモニターでつけっぱなしにする時用 (?zoom=2)。rem を大きくする
const zoom = Number(new URLSearchParams(location.search).get("zoom"));
if (zoom >= 0.5 && zoom <= 4) document.documentElement.style.fontSize = `${16 * zoom}px`;

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
