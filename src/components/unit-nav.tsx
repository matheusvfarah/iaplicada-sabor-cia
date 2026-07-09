import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ClipboardList, UtensilsCrossed, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRecebidosCount } from "@/lib/use-recebidos-count";
import { cn } from "@/lib/utils";

const ITEMS = [
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
  },
  {
    to: "/unidade/$unidadeId/cardapio" as const,
    label: "Cardápio",
    icon: UtensilsCrossed,
    exact: false,
  },
  {
    to: "/unidade/$unidadeId/configuracoes" as const,
    label: "Configurações",
    icon: Settings,
    exact: false,
  },
];

// Navegação da unidade só existe no mobile agora — no desktop, a
// navegação vive inteira no painel esquerdo (AppSidebar), sem duplicar
// numa barra horizontal também.
export function UnitNav({ unidadeId }: { unidadeId: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const recebidos = useRecebidosCount(unidadeId);

  const isActive = (to: string, exact?: boolean) => {
    const resolved = to.replace("$unidadeId", String(unidadeId));
    return exact ? pathname === resolved : pathname.startsWith(resolved);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-background/95 py-1.5 backdrop-blur-md sm:hidden">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.to, item.exact);
        return (
          <Link
            key={item.to}
            to={item.to}
            params={{ unidadeId: String(unidadeId) }}
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
  );
}
