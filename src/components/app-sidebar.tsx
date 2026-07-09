import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Settings,
  Globe,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Store,
  Star,
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
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLogo } from "@/components/brand-logo";
import { signOut, useSession } from "@/lib/auth";
import { useRecebidosCount } from "@/lib/use-recebidos-count";
import { usePedidosHojeCount } from "@/lib/use-pedidos-hoje-count";
import { useUnidades } from "@/lib/use-unidades";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isUnidadeAberta, useMinuteTick } from "@/lib/unidade-status";
import { useNotificacoesCtx } from "@/lib/notificacoes-context";
import { TIPOS_OPERACIONAIS } from "@/lib/use-notificacoes";
import { cn } from "@/lib/utils";

const UNIDADE_ITEMS = [
  {
    to: "/unidade/$unidadeId" as const,
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    to: "/unidade/$unidadeId/pedidos" as const,
    label: "Pedidos",
    icon: ClipboardList,
    exact: false,
    showPendentes: true,
  },
  {
    to: "/unidade/$unidadeId/cardapio" as const,
    label: "Cardápio",
    icon: UtensilsCrossed,
    exact: false,
  },
  {
    to: "/unidade/$unidadeId/avaliacoes" as const,
    label: "Avaliações",
    icon: Star,
    exact: false,
  },
  {
    to: "/unidade/$unidadeId/configuracoes" as const,
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

function statusDotClass(aberta: boolean) {
  return aberta ? "bg-success" : "bg-sidebar-foreground/30";
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useSession();
  const navigate = useNavigate();
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  const isAdmin = session?.profile.role === "gestor_geral";

  // Gestor: modo unidade só quando a URL está debaixo de /unidade/:id.
  // Gerente: sempre modo unidade (não tem "rede" pra ver).
  const unitMatch = pathname.match(/^\/unidade\/(\d+)/);
  const inUnitMode = isAdmin ? !!unitMatch : true;
  const activeUnitId = isAdmin
    ? unitMatch
      ? Number(unitMatch[1])
      : null
    : (session?.profile.unidade_id ?? null);

  const { data: unidades = [] } = useUnidades();
  useMinuteTick();
  const { notificacoes } = useNotificacoesCtx();

  // Badge por unidade na lista "Unidades" (só gestor, fora do modo
  // unidade): conta as notificações operacionais (pedido novo/
  // cancelado/atrasado) que NÃO aparecem no sino do gestor — ao entrar
  // na unidade elas migram pro sino (NotificationsBell recebe
  // unidadeIdAtual) e, marcadas como lida lá, esse contador zera
  // sozinho (mesmo estado, via NotificacoesProvider).
  const badgesPorUnidade = new Map<number, { total: number; urgente: boolean }>();
  for (const n of notificacoes) {
    if (!TIPOS_OPERACIONAIS.has(n.tipo)) continue;
    const atual = badgesPorUnidade.get(n.unidade_id) ?? { total: 0, urgente: false };
    atual.total += 1;
    if (n.tipo === "pedido_atrasado" || n.tipo === "pedido_cancelado_auto") atual.urgente = true;
    badgesPorUnidade.set(n.unidade_id, atual);
  }

  const currentUnit = unidades.find((u) => u.id === activeUnitId) ?? null;
  const currentUnitInativa = currentUnit?.status === "inativa";
  const currentUnitAberta =
    !!currentUnit && currentUnit.status === "ativa" && isUnidadeAberta(currentUnit);

  const isActive = (path: string) => pathname === path;
  const recebidos = useRecebidosCount(inUnitMode ? activeUnitId : null);
  const pedidosHoje = usePedidosHojeCount(inUnitMode ? activeUnitId : null);

  function switchUnit(novoId: number) {
    const suffix = pathname.replace(/^\/unidade\/\d+/, "");
    navigate({ to: `/unidade/${novoId}${suffix}` });
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <ItalyStripe />
      <SidebarHeader className="gap-3 border-b border-sidebar-border pt-3">
        <div className={collapsed ? "flex justify-center" : "px-2"}>
          <BrandLogo size="md" variant="on-dark" showText={!collapsed} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {inUnitMode ? (
          <>
            <SidebarGroup className="pb-0">
              <SidebarGroupContent>
                {collapsed ? (
                  <div
                    className="flex justify-center py-1"
                    title={
                      currentUnit
                        ? `${currentUnit.nome} · ${currentUnitInativa ? "Inativa" : currentUnitAberta ? "Aberta" : "Fechada"}`
                        : undefined
                    }
                  >
                    {!currentUnitInativa && (
                      <span
                        className={cn("size-2 rounded-full", statusDotClass(currentUnitAberta))}
                      />
                    )}
                  </div>
                ) : isAdmin ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent/60 px-3 py-2.5 text-left hover:bg-sidebar-accent">
                        {!currentUnitInativa && (
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              statusDotClass(currentUnitAberta),
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-xs font-semibold text-sidebar-foreground",
                            currentUnitInativa && "opacity-45",
                          )}
                        >
                          {currentUnit?.nome ?? "Unidade"}
                        </span>
                        <ChevronDown className="size-3.5 shrink-0 text-sidebar-foreground/60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {unidades.map((u) => {
                        if (u.status === "inativa") {
                          return (
                            <DropdownMenuItem
                              key={u.id}
                              disabled
                              className="opacity-45"
                              title="Unidade inativa"
                            >
                              <span className="truncate">{u.nome}</span>
                            </DropdownMenuItem>
                          );
                        }
                        const aberta = isUnidadeAberta(u);
                        return (
                          <DropdownMenuItem key={u.id} onClick={() => switchUnit(u.id)}>
                            <span
                              className={cn(
                                "mr-2 size-1.5 shrink-0 rounded-full",
                                aberta ? "bg-success" : "bg-muted-foreground/40",
                              )}
                            />
                            <span className="truncate">{u.nome}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="rounded-lg bg-sidebar-accent/60 px-3 py-2.5">
                    <p className="truncate text-xs font-semibold text-sidebar-foreground">
                      {currentUnit?.nome ?? "Unidade"}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {!currentUnitInativa && (
                        <span
                          className={cn("size-1.5 rounded-full", statusDotClass(currentUnitAberta))}
                        />
                      )}
                      <span className="text-[10px] text-sidebar-foreground/60">
                        {currentUnitInativa
                          ? "Inativa"
                          : `${currentUnitAberta ? "Aberta" : "Fechada"} · ${pedidosHoje} pedido${pedidosHoje === 1 ? "" : "s"} hoje`}
                      </span>
                    </div>
                  </div>
                )}
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {UNIDADE_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const resolved = item.to.replace("$unidadeId", String(activeUnitId));
                    const active = item.exact
                      ? pathname === resolved
                      : pathname.startsWith(resolved);
                    return (
                      <SidebarMenuItem key={item.to} className="relative">
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className={activeNavClasses(active)}
                        >
                          <Link to={item.to} params={{ unidadeId: String(activeUnitId) }}>
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

            {isAdmin && (
              <>
                <SidebarSeparator />
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Voltar à rede">
                          <Link to="/rede">
                            <ChevronLeft />
                            {!collapsed && <span>Voltar à rede</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </>
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/rede")}
                      tooltip="Dashboard Geral"
                      className={activeNavClasses(isActive("/rede"))}
                    >
                      <Link to="/rede">
                        <Globe />
                        {!collapsed && <span>Dashboard Geral</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/rede/configuracoes")}
                      tooltip="Configurações"
                      className={activeNavClasses(isActive("/rede/configuracoes"))}
                    >
                      <Link to="/rede/configuracoes">
                        <Settings />
                        {!collapsed && <span>Configurações</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <SidebarGroup>
              {!collapsed && <SidebarGroupLabel>Unidades</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {unidades.map((u) => {
                    if (u.status === "inativa") {
                      return (
                        <SidebarMenuItem key={u.id}>
                          <div
                            className="flex w-full cursor-default items-center gap-2 rounded-md p-2 text-sm opacity-45"
                            title={`${u.nome} · Inativa`}
                          >
                            <Store className="size-4 shrink-0" />
                            {!collapsed && <span className="flex-1 truncate">{u.nome}</span>}
                          </div>
                        </SidebarMenuItem>
                      );
                    }
                    const aberta = isUnidadeAberta(u);
                    const badge = badgesPorUnidade.get(u.id);
                    return (
                      <SidebarMenuItem key={u.id} className="relative">
                        <SidebarMenuButton asChild tooltip={u.nome}>
                          <Link to="/unidade/$unidadeId" params={{ unidadeId: String(u.id) }}>
                            <Store />
                            {!collapsed && <span className="flex-1 truncate">{u.nome}</span>}
                            {!collapsed && badge && (
                              <span
                                className={cn(
                                  "grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[10px] font-semibold",
                                  badge.urgente
                                    ? "bg-danger-tint text-danger-tint-foreground"
                                    : "bg-accent-tint text-accent-tint-foreground",
                                )}
                              >
                                {badge.total > 9 ? "9+" : badge.total}
                              </span>
                            )}
                            {!collapsed && (
                              <span
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full",
                                  statusDotClass(aberta),
                                )}
                              />
                            )}
                          </Link>
                        </SidebarMenuButton>
                        {collapsed && badge && (
                          <span
                            className={cn(
                              "pointer-events-none absolute bottom-1 right-1 size-1.5 rounded-full",
                              badge.urgente ? "bg-destructive" : "bg-accent-tint-foreground",
                            )}
                          />
                        )}
                        {collapsed && (
                          <span
                            className={cn(
                              "pointer-events-none absolute right-1 top-1 size-1.5 rounded-full",
                              statusDotClass(aberta),
                            )}
                          />
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div
          className={collapsed ? "flex justify-center py-2" : "flex items-center gap-2 px-2 py-2"}
        >
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
