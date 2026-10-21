import { AuthProvider, notifyUnauthorized } from "@fleetly/ui-component-core/auth";
import { HttpError } from "@fleetly/ui-component-core/data";
import { ThemeProvider } from "@fleetly/ui-component-core/theme";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setToken } from "./lib/api";
import { authProvider } from "./lib/auth";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

/**
 * 401 全局处理：QueryCache 捕获 HttpError(401) → notifyUnauthorized()（core）
 * → AuthProvider 的 onUnauthorized 回调（清 token + 跳 sign-in 带 next）。
 */
const handleUnauthorized = () => {
  setToken(null);
  const next = `${window.location.pathname}${window.location.search}`;
  void router.navigate({ to: "/auth/sign-in", search: next ? { next } : {} });
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof HttpError && error.status === 401) {
        notifyUnauthorized();
      }
    },
  }),
});

const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider provider={authProvider} onUnauthorized={handleUnauthorized}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
