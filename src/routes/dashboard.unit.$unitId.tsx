import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CURRENCY,
  CURRENCY_FULL,
  generateOrders,
  getUnitById,
  type Order,
  type OrderStatus,
  type Platform,
} from "@/lib/mock-data";
import { exportCSV, exportPDF } from "@/lib/export";

export const Route = createFileRoute("/dashboard/unit/$unitId")({
  loader: ({ params }) => {
    const unit = getUnitById(params.unitId);
    if (!unit) throw notFound();
    return { unit };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.unit.name} — Sabor & Cia` },
          {
            name: "description",
            content: `Operação em tempo real da unidade ${loaderData.unit.name} — pedidos, receita vs meta e avaliações.`,
          },
        ]
      : [{ title: "Unidade — Sabor & Cia" }],
  }),
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">
          Unidade não encontrada
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold">
          Cozinha não faz parte da rede
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Verifique o link ou volte para o dashboard geral.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Voltar ao Dashboard</Link>
        </Button>
      </div>
    </div>
  ),
  component: UnitDashboard,
});

const platformDot: Record<Platform, string> = {
  iFood: "bg-red-500",
  Rappi: "bg-orange-400",
  UberEats: "bg-emerald-500",
  Próprio: "bg-primary",
};

const statusBadge: Record<OrderStatus, { label: string; className: string }> = {
  novo: {
    label: "Novo",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  preparo: {
    label: "Em preparo",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  entrega: {
    label: "Saiu p/ entrega",
    className: "bg-sky-500/10 text-sky-500 border-sky-500/20",
  },
  concluido: {
    label: "Concluído",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  cancelado: {
    label: "Cancelado",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

function UnitDashboard() {
  const { unit } = Route.useLoaderData();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);

  // Simulated live loading
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      setOrders(generateOrders(unit.id, 20));
      setLoading(false);
    }, 450);
    return () => clearTimeout(t);
  }, [unit.id]);

  // Simulated realtime tick: rotate a new order in every 12s
  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      setOrders((prev) => {
        const next = generateOrders(unit.id + Date.now(), 1)[0];
        return [
          { ...next, id: `#${9500 + Math.floor(Math.random() * 500)}` },
          ...prev.slice(0, 19),
        ];
      });
    }, 12000);
    return () => clearInterval(interval);
  }, [loading, unit.id]);

  const top5 = useMemo(
    () => [...orders].sort((a, b) => b.value - a.value).slice(0, 5),
    [orders],
  );

  const goalPct = Math.min(100, (unit.revenueMonth / unit.goalMonth) * 100);

  const handleExportCSV = () => {
    exportCSV(
      `sabor-cia-${unit.id}-pedidos`,
      orders.map((o) => ({
        id: o.id,
        criado_em: o.createdAt,
        cliente: o.customer,
        plataforma: o.platform,
        status: o.status,
        itens: o.items,
        valor: o.value,
      })),
    );
  };

  const handleExportPDF = () => {
    exportPDF(
      `sabor-cia-${unit.id}`,
      `Sabor & Cia — ${unit.name}`,
      JSON.stringify({ unit, orders }, null, 2),
    );
  };

  return (
    <>
      <TopBar
        title={unit.name}
        subtitle={`${unit.city} • operação em tempo real`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={handleExportCSV}
            >
              <Download className="mr-1.5 size-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={handleExportPDF}
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
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Top KPIs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Receita do mês
                <Target className="size-3.5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-3xl font-bold">
                {CURRENCY.format(unit.revenueMonth)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Meta: {CURRENCY.format(unit.goalMonth)}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Nota do mês
                <Star className="size-3.5 fill-primary text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <p className="font-display text-3xl font-bold">
                  {unit.rating.toFixed(1)}
                </p>
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`size-3.5 ${
                        i < Math.round(unit.rating)
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Baseado em {(unit.ordersMonth * 0.32).toFixed(0)} avaliações
              </p>
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
              <p className="font-display text-3xl font-bold">
                {loading ? "—" : orders.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ticket médio {CURRENCY.format(unit.avgTicket)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Orders + Top 5 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="font-display text-base">
                  Pedidos do dia
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Atualizado em tempo real
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-500"
              >
                {loading ? "…" : `${orders.filter((o) => o.status === "novo" || o.status === "preparo").length} ativos`}
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
                          <TableCell className="font-mono text-xs">
                            {o.id}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              <span
                                className={`size-1.5 rounded-full ${platformDot[o.platform]}`}
                              />
                              {o.platform}
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
                            {CURRENCY_FULL.format(o.value)}
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
              <CardTitle className="font-display text-base">
                Top 5 pedidos por valor
              </CardTitle>
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
                      <p className="truncate text-sm font-semibold">
                        {o.customer}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {o.platform} • {o.items} itens
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm font-semibold">
                      {CURRENCY_FULL.format(o.value)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
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