import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Settings,
  Star,
  MoreHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
];

// Itens que não cabem na barra de 4 no mobile ficam agrupados atrás
// de "Mais" — mesmo conjunto que a sidebar mostra inteiro no desktop.
const MAIS_ITEMS = [
  {
    to: "/unidade/$unidadeId/avaliacoes" as const,
    label: "Avaliações",
    icon: Star,
  },
  {
    to: "/unidade/$unidadeId/configuracoes" as const,
    label: "Configurações",
    icon: Settings,
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

  const maisAtivo = MAIS_ITEMS.some((item) => isActive(item.to));

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
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium",
            maisAtivo ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal className="size-4" />
          Mais
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-48">
          {MAIS_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.to} asChild>
                <Link to={item.to} params={{ unidadeId: String(unidadeId) }}>
                  <Icon className="mr-2 size-3.5" />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
