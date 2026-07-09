import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Store, LogOut, Circle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";
import { signOut, useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type Unidade = {
  id: number;
  nome: string;
  status: "ativa" | "inativa";
};

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useSession();
  const navigate = useNavigate();
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  const isAdmin = session?.profile.role === "gestor_geral";

  useEffect(() => {
    if (!session) return;
    supabase
      .from("unidades")
      .select("id, nome, status")
      .order("nome")
      .then(({ data }) => setUnidades(data ?? []));
  }, [session]);

  const isActive = (path: string) => pathname === path;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="px-2 py-2">
          <BrandLogo size="md" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Rede</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/dashboard")}
                    tooltip="Dashboard Geral"
                  >
                    <Link to="/dashboard">
                      <LayoutDashboard />
                      <span>Dashboard Geral</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Unidades</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {unidades.map((u) => (
                <SidebarMenuItem key={u.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/dashboard/unit/${u.id}`}
                    tooltip={u.nome}
                  >
                    <Link to="/dashboard/unit/$unitId" params={{ unitId: String(u.id) }}>
                      <Store />
                      <span className="truncate">{u.nome}</span>
                      <Circle
                        className={`ml-auto size-2 fill-current ${
                          u.status === "ativa" ? "text-emerald-500" : "text-muted-foreground"
                        }`}
                      />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-accent font-mono text-xs font-semibold">
            {(session?.profile.nome ?? "??").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-semibold">{session?.profile.nome}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {isAdmin ? "Gestor de Rede" : "Operador de Unidade"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 group-data-[collapsible=icon]:hidden"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            aria-label="Sair"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
