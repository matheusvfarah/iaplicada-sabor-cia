import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // staleTime 60s + refetchOnWindowFocus:false: KPIs e listas de
  // referência (unidades etc.) não precisam refazer a query toda vez
  // que a aba ganha foco ou o usuário navega entre abas da unidade —
  // isso era uma causa real de lentidão percebida (item 2, rodada 4).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
