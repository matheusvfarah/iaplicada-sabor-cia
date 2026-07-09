import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Sandwich,
  UtensilsCrossed,
  CupSoda,
  IceCreamCone,
  Package,
  Download,
  FileText,
  ChevronDown,
} from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { NotificationsBell } from "@/components/notifications-bell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { CURRENCY_FULL } from "@/lib/currency";
import { exportCsv, exportPdf, type ExportDataset } from "@/lib/export";
import { useUnit } from "@/lib/unit-context";
import { cn } from "@/lib/utils";

type Produto = {
  id: number;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria: string | null;
  disponivel: boolean;
};

const CATEGORY_LABEL: Record<string, string> = {
  burgers: "Burgers",
  pratos: "Pratos",
  bebidas: "Bebidas",
  sobremesas: "Sobremesas",
};

const CATEGORY_ICON: Record<string, typeof Package> = {
  burgers: Sandwich,
  pratos: UtensilsCrossed,
  bebidas: CupSoda,
  sobremesas: IceCreamCone,
};

export const Route = createFileRoute("/unidade/$unidadeId/cardapio")({
  head: () => ({ meta: [{ title: "Cardápio — Sabor & Cia" }] }),
  component: CardapioPage,
});

function CardapioPage() {
  const unit = useUnit();
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");

  useEffect(() => {
    let active = true;
    supabase
      .from("produtos")
      .select("id, nome, descricao, preco, categoria, disponivel")
      .eq("unidade_id", unit.id)
      .order("nome")
      .then(({ data }) => {
        if (!active) return;
        setProdutos(data ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [unit.id]);

  const categorias = useMemo(
    () => [...new Set(produtos.map((p) => p.categoria).filter((c): c is string => !!c))],
    [produtos],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (categoria !== "todas" && p.categoria !== categoria) return false;
      if (termo && !p.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [produtos, busca, categoria]);

  const ativos = produtos.filter((p) => p.disponivel).length;
  const pausados = produtos.length - ativos;

  async function handleToggle(produto: Produto, disponivel: boolean) {
    setProdutos((prev) => prev.map((p) => (p.id === produto.id ? { ...p, disponivel } : p)));
    const { error } = await supabase.from("produtos").update({ disponivel }).eq("id", produto.id);
    if (error) {
      setProdutos((prev) =>
        prev.map((p) => (p.id === produto.id ? { ...p, disponivel: !disponivel } : p)),
      );
      toast.error("Não foi possível atualizar o item.", { description: error.message });
      return;
    }
    if (!disponivel) {
      toast.warning(`${produto.nome} pausado`, {
        description: "Não aparece para novos pedidos.",
      });
    } else {
      toast.success(`${produto.nome} reativado`, { description: "Voltou a aparecer no cardápio." });
    }
  }

  const categoriaLabel =
    categoria === "todas" ? "Todas as categorias" : (CATEGORY_LABEL[categoria] ?? categoria);

  const buildExportDataset = (): ExportDataset => ({
    page: `unidade-${unit.id}-cardapio`,
    title: `${unit.nome} — Cardápio`,
    period: busca.trim() ? `${categoriaLabel} · busca: "${busca.trim()}"` : categoriaLabel,
    sections: [
      {
        columns: [
          { header: "Item", value: (r: Produto) => r.nome },
          { header: "Categoria", value: (r: Produto) => CATEGORY_LABEL[r.categoria ?? ""] ?? "—" },
          { header: "Preço", value: (r: Produto) => CURRENCY_FULL.format(r.preco) },
          { header: "Status", value: (r: Produto) => (r.disponivel ? "Ativo" : "Pausado") },
        ],
        rows: filtrados,
      },
    ],
  });

  const handleExportCSV = () => exportCsv(buildExportDataset());
  const handleExportPDF = () => exportPdf(buildExportDataset());

  return (
    <>
      <TopBar
        title="Cardápio"
        subtitle={loading ? "Carregando…" : `${ativos} itens ativos · ${pausados} pausados`}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || filtrados.length === 0}
                  className="gap-1.5"
                >
                  <Download className="size-3.5" />
                  Exportar
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileText className="mr-2 size-3.5" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>
                  <FileText className="mr-2 size-3.5" />
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationsBell unidadeIdAtual={unit.id} />
            <AlertsBadge />
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar item…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={categoria} onValueChange={setCategoria}>
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              {categorias.map((c) => (
                <TabsTrigger key={c} value={c}>
                  {CATEGORY_LABEL[c] ?? c}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <Package className="mb-3 size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum item encontrado</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Ajuste a busca ou o filtro de categoria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtrados.map((produto) => {
              const Icon = (produto.categoria && CATEGORY_ICON[produto.categoria]) || Package;
              return (
                <Card
                  key={produto.id}
                  className={cn("transition-opacity", !produto.disponivel && "opacity-50")}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                        <Icon className="size-5 text-primary" />
                      </div>
                      {!produto.disponivel && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-accent-tint text-[10px] text-accent-tint-foreground"
                        >
                          Pausado
                        </Badge>
                      )}
                    </div>
                    <p className="mt-3 truncate font-display text-sm font-semibold">
                      {produto.nome}
                    </p>
                    {produto.descricao && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {produto.descricao}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <p className="font-mono text-sm font-bold">
                        {CURRENCY_FULL.format(produto.preco)}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {produto.disponivel ? "Ativo" : "Pausado"}
                        </span>
                        <Switch
                          checked={produto.disponivel}
                          onCheckedChange={(checked) => handleToggle(produto, checked)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
