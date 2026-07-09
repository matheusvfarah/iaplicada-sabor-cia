import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Store,
  LogOut,
  Circle,
  ClipboardList,
  UtensilsCrossed,
  Settings,
} from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";
import { signOut, useSession } from "@/lib/auth";
import { useRecebidosCount } from "@/lib/use-recebidos-count";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Unidade = {
  id: number;
  nome: string;
  status: "ativa" | "inativa";
};

const OPERACAO_ITEMS = [
  {
    to: "/dashboard/unit/$unitId" as const,
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    to: "/dashboard/unit/$unitId/pedidos" as const,
    label: "Pedidos",
    icon: ClipboardList,
    exact: false,
  },
  {
    to: "/dashboard/unit/$unitId/cardapio" as const,
    label: "Cardápio",
    icon: UtensilsCrossed,
    exact: false,
  },
  {
    to: "/dashboard/unit/$unitId/configuracoes" as const,
    label: "Configurações",
    icon: Settings,
    exact: false,
  },
];

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
  const unitMatch = pathname.match(/^\/dashboard\/unit\/(\d+)/);
  const activeUnitId = unitMatch ? Number(unitMatch[1]) : null;
  const recebidos = useRecebidosCount(activeUnitId);

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
              {unidades.map((u) => {
                const isCurrentUnit = u.id === activeUnitId;
                return (
                  <SidebarMenuItem key={u.id}>
                    <SidebarMenuButton asChild isActive={isCurrentUnit} tooltip={u.nome}>
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

                    {isCurrentUnit && (
                      <SidebarMenuSub>
                        {OPERACAO_ITEMS.map((item) => {
                          const Icon = item.icon;
                          const resolved = item.to.replace("$unitId", String(u.id));
                          const active = item.exact
                            ? pathname === resolved
                            : pathname.startsWith(resolved);
                          return (
                            <SidebarMenuSubItem key={item.to}>
                              <SidebarMenuSubButton asChild isActive={active}>
                                <Link to={item.to} params={{ unitId: String(u.id) }}>
                                  <Icon />
                                  <span className="flex-1">{item.label}</span>
                                  {item.label === "Pedidos" && recebidos > 0 && (
                                    <Badge className="h-4 min-w-4 justify-center px-1 text-[10px]">
                                      {recebidos}
                                    </Badge>
                                  )}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
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
