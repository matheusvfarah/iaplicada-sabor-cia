import { createContext, useContext, type ReactNode } from "react";
import { useNotificacoes } from "@/lib/use-notificacoes";

type NotificacoesContextValue = ReturnType<typeof useNotificacoes>;

const NotificacoesContext = createContext<NotificacoesContextValue | null>(null);

// Uma única assinatura realtime pro app inteiro — o sino (TopBar) e o
// badge por unidade (sidebar do gestor) precisam enxergar exatamente o
// mesmo estado, senão marcar como lida num lugar poderia demorar um
// round-trip de rede pra refletir no outro.
export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const value = useNotificacoes();
  return <NotificacoesContext.Provider value={value}>{children}</NotificacoesContext.Provider>;
}

export function useNotificacoesCtx() {
  const ctx = useContext(NotificacoesContext);
  if (!ctx) {
    throw new Error("useNotificacoesCtx() precisa ser usado dentro de NotificacoesProvider");
  }
  return ctx;
}
