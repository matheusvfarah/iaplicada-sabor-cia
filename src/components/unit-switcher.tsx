import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Settings,
  Search,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { isUnidadeAberta, useMinuteTick, type HorarioFuncionamento } from "@/lib/unidade-status";

type Unidade = HorarioFuncionamento & {
  id: number;
  nome: string;
  status: "ativa" | "inativa";
};

const TABS = [
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

// Só o gestor geral vê isso: ele não tem os 4 itens na sidebar (que fica
// restrita a Rede/Alertas/Configurações), então a navegação da unidade
// vira essas abas + o seletor de unidade troca o contexto sem navegar
// de volta para /dashboard.
export function UnitSwitcher({ currentUnit }: { currentUnit: { id: number; nome: string } }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("unidades")
      .select("id, nome, status, horario_abertura, horario_fechamento")
      .order("nome")
      .then(({ data }) => setUnidades((data as Unidade[]) ?? []));
  }, []);

  useMinuteTick();

  const filtered = useMemo(() => {
    if (!search.trim()) return unidades;
    const q = search.trim().toLowerCase();
    return unidades.filter((u) => u.nome.toLowerCase().includes(q));
  }, [unidades, search]);

  const abertaFor = (u: Unidade) => u.status === "ativa" && isUnidadeAberta(u);
  const currentAberta = (() => {
    const u = unidades.find((u) => u.id === currentUnit.id);
    return u ? abertaFor(u) : false;
  })();

  // Troca a unidade mas preserva a aba atual (ex.: em Pedidos de
  // Pinheiros, trocar pra Moema deve cair em Pedidos de Moema).
  function switchTo(unitId: number) {
    const suffix = pathname.replace(`/dashboard/unit/${currentUnit.id}`, "");
    navigate({ to: `/dashboard/unit/${unitId}${suffix}` });
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="border-b border-border bg-surface">
      <div className="flex h-14 items-center gap-3 px-4 text-sm sm:px-6 lg:px-8">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
          Rede
        </Link>
        <span className="text-muted-foreground">/</span>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
              aria-label="Trocar de unidade"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  currentAberta ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              {currentUnit.nome}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 p-0">
            {unidades.length > 5 && (
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar unidade…"
                  className="h-7 border-none px-0 shadow-none focus-visible:ring-0"
                />
              </div>
            )}
            <div className="max-h-72 overflow-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma unidade encontrada.
                </p>
              ) : (
                filtered.map((u) => {
                  const aberta = abertaFor(u);
                  return (
                    <button
                      key={u.id}
                      onClick={() => switchTo(u.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-secondary",
                        u.id === currentUnit.id && "bg-secondary/60 font-medium",
                      )}
                    >
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          aberta ? "bg-success" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{u.nome}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          aberta
                            ? "bg-success-tint text-success-tint-foreground"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {aberta ? "Aberta" : "Fechada"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
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
