import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, LayoutDashboard, ClipboardList, UtensilsCrossed, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Unidade = { id: number; nome: string };

const TABS = [
  { to: "/dashboard/unit/$unitId" as const, label: "Dashboard", icon: LayoutDashboard, exact: true },
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

// Só o gestor geral vê isso: ele não tem os 4 itens na sidebar (que fica
// restrita a Rede/Alertas/Configurações), então a navegação da unidade
// vira essas abas + o seletor de unidade troca o contexto sem navegar
// de volta para /dashboard.
export function UnitSwitcher({ currentUnit }: { currentUnit: { id: number; nome: string } }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  useEffect(() => {
    supabase
      .from("unidades")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setUnidades(data ?? []));
  }, []);

  return (
    <div className="border-b border-border bg-surface">
      <div className="flex h-11 items-center gap-1.5 px-4 text-sm sm:px-6 lg:px-8">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
          Rede
        </Link>
        <span className="text-muted-foreground">/</span>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-secondary">
            {currentUnit.nome}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {unidades.map((u) => (
              <DropdownMenuItem
                key={u.id}
                onClick={() =>
                  navigate({
                    to: "/dashboard/unit/$unitId",
                    params: { unitId: String(u.id) },
                  })
                }
              >
                {u.nome}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto px-3 sm:px-5 lg:px-7">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const resolved = tab.to.replace("$unitId", String(currentUnit.id));
          const active = tab.exact ? pathname === resolved : pathname.startsWith(resolved);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ unitId: String(currentUnit.id) }}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
