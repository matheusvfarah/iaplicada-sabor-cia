import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useSession } from "@/lib/auth";

// Casca comum das rotas autenticadas (/rede/* e /unidade/*): guarda de
// sessão + sidebar. A sidebar decide sozinha (pelo pathname) se mostra
// o modo rede ou o modo unidade — ver app-sidebar.tsx.
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { session, ready } = useSession();

  useEffect(() => {
    if (ready && !session) {
      navigate({ to: "/login", replace: true });
    }
  }, [ready, session, navigate]);

  if (!ready || !session) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-xs text-muted-foreground">Verificando sessão…</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="min-w-0 flex-1 bg-background">{children}</SidebarInset>
      </div>
    </SidebarProvider>
  );
}
