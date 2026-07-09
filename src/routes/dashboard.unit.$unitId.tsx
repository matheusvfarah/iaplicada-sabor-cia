import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileText, Star, Target, Trophy } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { PeriodFilter } from "@/components/period-filter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { CURRENCY, CURRENCY_FULL } from "@/lib/currency";
import { exportCSV, exportPDF } from "@/lib/export";
import {
  periodRange,
  periodLabel as computePeriodLabel,
  defaultCustomRange,
  type PeriodId,
} from "@/lib/period";

type Plataforma = "ifood" | "rappi" | "proprio";
type StatusPedido = "pendente" | "recebido" | "preparando" | "entregue" | "cancelado";

type Pedido = {
  id: number;
  unidade_id: number;
  valor: number;
  plataforma: Plataforma;
  status: StatusPedido;
  data_pedido: string;
};

type KpiUnidade = {
  receita: number;
  meta: number | null;
  pct_meta: number | null;
  nota_media: number | null;
  total_avaliacoes: number;
};

type Produto = {
  id: number;
  nome: string;
  preco: number;
  disponivel: boolean;
};

type PedidoItemDetalhe = {
  id: number;
  quantidade: number;
  preco_unitario: number;
  produto: { id: number; nome: string; disponivel: boolean } | null;
};

type Unidade = {
  id: number;
  nome: string;
};

const PLATFORM_LABEL: Record<Plataforma, string> = {
  ifood: "iFood",
  rappi: "Rappi",
  proprio: "Próprio",
};

const platformDot: Record<Plataforma, string> = {
  ifood: "bg-red-500",
  rappi: "bg-orange-400",
  proprio: "bg-primary",
};

const statusBadge: Record<StatusPedido, { label: string; className: string }> = {
  pendente: {
    label: "Pendente",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  recebido: {
    label: "Recebido",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  preparando: {
    label: "Em preparo",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  entregue: {
    label: "Entregue",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  cancelado: {
    label: "Cancelado",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

export const Route = createFileRoute("/dashboard/unit/$unitId")({
  // Não consulta o Supabase aqui: esse loader roda no servidor (SSR) em
  // reloads/navegação direta, e o client ali não tem a sessão de auth
  // (ela só existe no localStorage do navegador) — RLS bloquearia
  // qualquer usuário, mesmo logado. A busca real acontece no client,
  // dentro do componente, igual o resto dos dados desta página.
  loader: ({ params }) => {
    const unidadeId = Number(params.unitId);
    if (!Number.isFinite(unidadeId)) throw notFound();
    return { unidadeId };
  },
  notFoundComponent: () => <UnidadeNaoEncontrada />,
  component: UnitDashboard,
});

function UnidadeNaoEncontrada() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">
          Unidade não encontrada
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold">Cozinha não faz parte da rede</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Verifique o link ou volte para o dashboard geral.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Voltar ao Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function UnitDashboard() {
  const { unidadeId } = Route.useLoaderData();
  const [unit, setUnit] = useState<Unidade | null>(null);
  const [unitNotFound, setUnitNotFound] = useState(false);
  const [period, setPeriod] = useState<PeriodId>("6m");
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Pedido[]>([]);
  const [kpis, setKpis] = useState<KpiUnidade | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [pendingQueue, setPendingQueue] = useState<Pedido[]>([]);
  const [pendingItens, setPendingItens] = useState<PedidoItemDetalhe[]>([]);
  const [resolvingPending, setResolvingPending] = useState(false);

  // Busca a unidade no client (não no loader — ver comentário na rota).
  useEffect(() => {
    let active = true;
    supabase
      .from("unidades")
      .select("id, nome")
      .eq("id", unidadeId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setUnitNotFound(true);
        else setUnit(data);
      });
    return () => {
      active = false;
    };
  }, [unidadeId]);

  useEffect(() => {
    if (!unit) return;
    if (period === "custom" && (!customRange.inicio || !customRange.fim)) return;

    let active = true;
    setLoading(true);
    const { p_inicio, p_fim } = periodRange(period, customRange);

    Promise.all([
      supabase
        .from("pedidos")
        .select("id, unidade_id, valor, plataforma, status, data_pedido")
        .eq("unidade_id", unit.id)
        .neq("status", "pendente")
        .gte("data_pedido", startOfToday())
        .order("data_pedido", { ascending: false }),
      supabase.rpc("rpc_kpis_unidade_periodo", { p_unidade: unit.id, p_inicio, p_fim }),
      supabase
        .from("pedidos")
        .select("id, unidade_id, valor, plataforma, status, data_pedido")
        .eq("unidade_id", unit.id)
        .eq("status", "pendente")
        .order("data_pedido", { ascending: true }),
      supabase
        .from("produtos")
        .select("id, nome, preco, disponivel")
        .eq("unidade_id", unit.id)
        .order("nome"),
    ]).then(([ordersRes, kpisRes, pendingRes, produtosRes]) => {
      if (!active) return;
      setOrders(ordersRes.data ?? []);
      setKpis(kpisRes.data?.[0] ?? null);
      setPendingQueue(pendingRes.data ?? []);
      setProdutos(produtosRes.data ?? []);
      setLoading(false);
    });

    const channel = supabase
      .channel(`pedidos-unidade-${unit.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `unidade_id=eq.${unit.id}` },
        (payload) => {
          const row = payload.new as Pedido;

          if (payload.eventType === "INSERT" && row.status === "pendente") {
            setPendingQueue((prev) => [...prev, row]);
            return;
          }

          setPendingQueue((prev) => prev.filter((p) => p.id !== row.id));

          if (row.status === "pendente") return;

          setOrders((prev) => {
            const withoutRow = prev.filter((o) => o.id !== row.id);
            return [row, ...withoutRow].sort(
              (a, b) => new Date(b.data_pedido).getTime() - new Date(a.data_pedido).getTime(),
            );
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [unit, period, customRange]);

  const currentPending = pendingQueue[0] ?? null;

  useEffect(() => {
    if (!currentPending) {
      setPendingItens([]);
      return;
    }
    let active = true;
    supabase
      .from("pedido_itens")
      .select("id, quantidade, preco_unitario, produto:produtos(id, nome, disponivel)")
      .eq("pedido_id", currentPending.id)
      .then(({ data }) => {
        if (active) setPendingItens((data as unknown as PedidoItemDetalhe[]) ?? []);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o id importa, não a identidade do objeto
  }, [currentPending?.id]);

  const top5 = useMemo(() => [...orders].sort((a, b) => b.valor - a.valor).slice(0, 5), [orders]);

  const periodLbl = useMemo(() => computePeriodLabel(period, customRange), [period, customRange]);

  const goalPct =
    kpis?.meta && kpis.meta > 0 ? Math.min(100, ((kpis?.receita ?? 0) / kpis.meta) * 100) : 0;

  async function handleResolverPendente(novoStatus: "recebido" | "cancelado") {
    if (!currentPending) return;
    setResolvingPending(true);
    const { error } = await supabase
      .from("pedidos")
      .update({ status: novoStatus })
      .eq("id", currentPending.id);
    setResolvingPending(false);
    if (!error) {
      setPendingQueue((prev) => prev.filter((p) => p.id !== currentPending.id));
    }
  }

  async function handleToggleDisponibilidade(produtoId: number, disponivel: boolean) {
    setProdutos((prev) => prev.map((p) => (p.id === produtoId ? { ...p, disponivel } : p)));
    const { error } = await supabase.from("produtos").update({ disponivel }).eq("id", produtoId);
    if (error) {
      setProdutos((prev) =>
        prev.map((p) => (p.id === produtoId ? { ...p, disponivel: !disponivel } : p)),
      );
    }
  }

  const handleExportCSV = () => {
    exportCSV(
      `sabor-cia-unidade-${unidadeId}-pedidos`,
      orders.map((o) => ({
        id: o.id,
        criado_em: o.data_pedido,
        plataforma: PLATFORM_LABEL[o.plataforma],
        status: o.status,
        valor: o.valor,
      })),
    );
  };

  const handleExportPDF = () => {
    exportPDF(
      `sabor-cia-unidade-${unidadeId}`,
      `Sabor & Cia — ${unit?.nome ?? ""}`,
      JSON.stringify({ unit, period, kpis, orders }, null, 2),
    );
  };

  if (unitNotFound) return <UnidadeNaoEncontrada />;

  return (
    <>
      <Dialog open={!!currentPending}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Novo pedido recebido</DialogTitle>
            <DialogDescription>
              {currentPending && (
                <>
                  Pedido #{currentPending.id} · {PLATFORM_LABEL[currentPending.plataforma]} ·{" "}
                  {CURRENCY_FULL.format(currentPending.valor)}
                  {pendingQueue.length > 1 && ` · +${pendingQueue.length - 1} na fila`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-64 space-y-2 overflow-auto">
            {pendingItens.length === 0 ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              pendingItens.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {item.quantidade}× {item.produto?.nome ?? "Item"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {CURRENCY_FULL.format(item.preco_unitario)} cada
                    </p>
                  </div>
                  {item.produto && !item.produto.disponivel && (
                    <Badge
                      variant="outline"
                      className="ml-2 shrink-0 gap-1 border-destructive/20 bg-destructive/10 text-[10px] text-destructive"
                    >
                      <AlertTriangle className="size-3" />
                      Indisponível agora
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={resolvingPending}
              onClick={() => handleResolverPendente("cancelado")}
            >
              Recusar
            </Button>
            <Button
              className="flex-1"
              disabled={resolvingPending}
              onClick={() => handleResolverPendente("recebido")}
            >
              Aceitar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TopBar
        title={unit?.nome ?? "Carregando…"}
        subtitle="Operação em tempo real"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={handleExportCSV}
              disabled={loading || orders.length === 0}
            >
              <Download className="mr-1.5 size-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={handleExportPDF}
              disabled={loading}
            >
              <FileText className="mr-1.5 size-3.5" />
              PDF
            </Button>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
              Live
            </span>
            <AlertsBadge />
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Filter row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Período (receita, meta e nota)
            </p>
            <p className="mt-1 font-display text-lg font-semibold">
              {period === "custom" ? periodLbl : `Últimos ${periodLbl.toLowerCase()}`}
            </p>
          </div>
          <PeriodFilter
            period={period}
            onPeriodChange={setPeriod}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Receita do período
                <Target className="size-3.5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <p className="font-display text-3xl font-bold">
                    {CURRENCY.format(kpis?.receita ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Meta prorrateada: {CURRENCY.format(kpis?.meta ?? 0)}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${goalPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right font-mono text-[10px] text-primary">
                    {goalPct.toFixed(1)}% da meta
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Nota do período
                <Star className="size-3.5 fill-primary text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <p className="font-display text-3xl font-bold">
                      {kpis?.nota_media ? kpis.nota_media.toFixed(1) : "—"}
                    </p>
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`size-3.5 ${
                            kpis?.nota_media && i < Math.round(kpis.nota_media)
                              ? "fill-primary text-primary"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Baseado em {kpis?.total_avaliacoes ?? 0} avaliações
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Pedidos hoje
                <Trophy className="size-3.5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-3xl font-bold">{loading ? "—" : orders.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {orders.length > 0
                  ? `Ticket médio ${CURRENCY.format(orders.reduce((s, o) => s + o.valor, 0) / orders.length)}`
                  : "Aguardando pedidos"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Orders + Top 5 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="font-display text-base">Pedidos do dia</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Atualizado em tempo real</p>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-500"
              >
                {loading
                  ? "…"
                  : `${orders.filter((o) => o.status === "recebido" || o.status === "preparando").length} ativos`}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <EmptyState
                  title="Sem pedidos ainda"
                  hint="Os pedidos aparecerão aqui assim que chegarem."
                />
              ) : (
                <div className="max-h-[520px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                          #
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                          Plataforma
                        </TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                          Status
                        </TableHead>
                        <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">
                          Valor
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o) => (
                        <TableRow key={o.id} className="text-sm">
                          <TableCell className="font-mono text-xs">#{o.id}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              <span
                                className={`size-1.5 rounded-full ${platformDot[o.plataforma]}`}
                              />
                              {PLATFORM_LABEL[o.plataforma]}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`h-5 text-[10px] ${statusBadge[o.status].className}`}
                            >
                              {statusBadge[o.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {CURRENCY_FULL.format(o.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display text-base">Top 5 pedidos por valor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))
              ) : top5.length === 0 ? (
                <EmptyState title="Sem dados" hint="Aguardando pedidos." />
              ) : (
                top5.map((o, i) => (
                  <div
                    key={o.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-surface p-3"
                  >
                    <span className="grid size-7 place-items-center rounded-md bg-primary/10 font-mono text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">Pedido #{o.id}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {PLATFORM_LABEL[o.plataforma]}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm font-semibold">
                      {CURRENCY_FULL.format(o.valor)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cardápio */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Disponibilidade do cardápio</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Itens indisponíveis ficam sinalizados nos pedidos que chegarem
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {produtos.map((produto) => (
                  <div
                    key={produto.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{produto.nome}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {CURRENCY_FULL.format(produto.preco)}
                      </p>
                    </div>
                    <Switch
                      checked={produto.disponivel}
                      onCheckedChange={(checked) =>
                        handleToggleDisponibilidade(produto.id, checked)
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="grid place-items-center p-10 text-center">
      <div className="max-w-xs">
        <div className="mx-auto grid size-10 place-items-center rounded-full bg-surface">
          <Trophy className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
