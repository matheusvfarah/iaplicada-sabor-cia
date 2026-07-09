import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Settings,
  Bell,
  Globe,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";
import { signOut, useSession } from "@/lib/auth";
import { useRecebidosCount } from "@/lib/use-recebidos-count";
import { usePedidosHojeCount } from "@/lib/use-pedidos-hoje-count";
import { useAlertasCount } from "@/lib/use-alertas-count";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  isUnidadeAberta,
  useMinuteTick,
  type HorarioFuncionamento,
} from "@/lib/unidade-status";

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
    showPendentes: true,
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

function ItalyStripe() {
  return (
    <div className="flex h-1 w-full shrink-0">
      <div className="flex-1 bg-success" />
      <div className="flex-1 bg-white" />
      <div className="flex-1 bg-destructive" />
    </div>
  );
}

function activeNavClasses(active: boolean) {
  return active
    ? "data-[active=true]:!bg-sidebar-primary data-[active=true]:!text-sidebar-primary-foreground data-[active=true]:font-semibold"
    : "";
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useSession();
  const navigate = useNavigate();
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const [unit, setUnit] = useState<
    | (HorarioFuncionamento & { id: number; nome: string; status: "ativa" | "inativa" })
    | null
  >(null);

  const isAdmin = session?.profile.role === "gestor_geral";
  const unidadeId = session?.profile.unidade_id ?? null;

  useEffect(() => {
    if (isAdmin || unidadeId == null) return;
    supabase
      .from("unidades")
      .select("id, nome, status, horario_abertura, horario_fechamento")
      .eq("id", unidadeId)
      .single()
      .then(({ data }) => setUnit(data ?? null));
  }, [isAdmin, unidadeId]);

  useMinuteTick();
  const unitAberta = !!unit && unit.status === "ativa" && isUnidadeAberta(unit);

  const isActive = (path: string) => pathname === path;
  const recebidos = useRecebidosCount(isAdmin ? null : unidadeId);
  const pedidosHoje = usePedidosHojeCount(isAdmin ? null : unidadeId);
  const alertasCount = useAlertasCount();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <ItalyStripe />
      <SidebarHeader className="gap-3 border-b border-sidebar-border pt-3">
        <div className={collapsed ? "flex justify-center" : "px-2"}>
          <BrandLogo size="md" variant="on-dark" showText={!collapsed} />
        </div>

        {!isAdmin && unit && !collapsed && (
          <div className="mx-2 rounded-lg bg-sidebar-accent/60 px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-sidebar-foreground">{unit.nome}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${
                  unitAberta ? "bg-success" : "bg-sidebar-foreground/30"
                }`}
              />
              <span className="text-[10px] text-sidebar-foreground/60">
                {unitAberta ? "Aberta" : "Fechada"} · {pedidosHoje} pedido
                {pedidosHoje === 1 ? "" : "s"} hoje
              </span>
            </div>
          </div>
        )}

        {!isAdmin && unit && collapsed && (
          <div className="flex justify-center" title={`${unit.nome} · ${unitAberta ? "Aberta" : "Fechada"}`}>
            <span
              className={`size-2 rounded-full ${unitAberta ? "bg-success" : "bg-sidebar-foreground/30"}`}
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {isAdmin ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/dashboard")}
                    tooltip="Rede"
                    className={activeNavClasses(isActive("/dashboard"))}
                  >
                    <Link to="/dashboard">
                      <Globe />
                      {!collapsed && <span>Rede</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className="relative">
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/dashboard/alertas")}
                    tooltip="Alertas"
                    className={activeNavClasses(isActive("/dashboard/alertas"))}
                  >
                    <Link to="/dashboard/alertas">
                      <Bell />
                      {!collapsed && (
                        <>
                          <span className="flex-1">Alertas</span>
                          {alertasCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="h-4 min-w-4 justify-center px-1 text-[10px]"
                            >
                              {alertasCount}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  </SidebarMenuButton>
                  {collapsed && alertasCount > 0 && (
                    <span className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-destructive" />
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {OPERACAO_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const resolved = item.to.replace("$unitId", String(unidadeId));
                  const active = item.exact ? pathname === resolved : pathname.startsWith(resolved);
                  return (
                    <SidebarMenuItem key={item.to} className="relative">
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={activeNavClasses(active)}
                      >
                        <Link to={item.to} params={{ unitId: String(unidadeId) }}>
                          <Icon />
                          {!collapsed && (
                            <>
                              <span className="flex-1">{item.label}</span>
                              {item.showPendentes && recebidos > 0 && (
                                <Badge
                                  variant="destructive"
                                  className="h-4 min-w-4 justify-center px-1 text-[10px]"
                                >
                                  {recebidos}
                                </Badge>
                              )}
                            </>
                          )}
                        </Link>
                      </SidebarMenuButton>
                      {collapsed && item.showPendentes && recebidos > 0 && (
                        <span className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-destructive" />
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className={collapsed ? "flex justify-center py-2" : "flex items-center gap-2 px-2 py-2"}>
          <div
            className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-foreground"
            title={collapsed ? session?.profile.nome : undefined}
          >
            {(session?.profile.nome ?? "??").slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-sidebar-foreground">
                  {session?.profile.nome}
                </p>
                <p className="truncate text-[10px] text-sidebar-foreground/60">
                  {isAdmin ? "Gestor de Rede" : "Gerente de Unidade"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/login" });
                }}
                aria-label="Sair"
              >
                <LogOut className="size-4" />
              </Button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
