import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ClipboardList, UtensilsCrossed, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const ITEMS = [
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

export function UnitNav({ unitId }: { unitId: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [recebidos, setRecebidos] = useState(0);

  useEffect(() => {
    let active = true;

    const fetchCount = () => {
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("unidade_id", unitId)
        .eq("status", "recebido")
        .then(({ count }) => {
          if (active) setRecebidos(count ?? 0);
        });
    };

    fetchCount();

    const channel = supabase
      .channel(`unit-nav-pedidos-${unitId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `unidade_id=eq.${unitId}` },
        fetchCount,
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [unitId]);

  const isActive = (to: string, exact?: boolean) => {
    const resolved = to.replace("$unitId", String(unitId));
    return exact ? pathname === resolved : pathname.startsWith(resolved);
  };

  return (
    <>
      {/* Desktop: barra horizontal abaixo do TopBar */}
      <nav className="hidden items-center gap-1 border-b border-border bg-background px-4 py-2 sm:flex sm:px-6 lg:px-8">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              params={{ unitId: String(unitId) }}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
              {item.label === "Pedidos" && recebidos > 0 && (
                <Badge className="h-4 min-w-4 justify-center px-1 text-[10px]">{recebidos}</Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: tabs fixas no rodapé */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-background/95 py-1.5 backdrop-blur-md sm:hidden">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              params={{ unitId: String(unitId) }}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
              {item.label === "Pedidos" && recebidos > 0 && (
                <Badge className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[9px]">
                  {recebidos}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
