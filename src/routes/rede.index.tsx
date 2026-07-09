import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, Download, FileText, Flame, Store, TrendingDown, Trophy } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { PeriodDropdown } from "@/components/period-dropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { CURRENCY } from "@/lib/currency";
import { exportCSV, exportPDF } from "@/lib/export";
import {
  parseDateOnly,
  periodRange,
  previousPeriodRange,
  periodLabel as computePeriodLabel,
  defaultCustomRange,
  type PeriodId,
  type Granularidade,
} from "@/lib/period";
import { KpiDelta, MicroDelta } from "@/components/kpi-delta";

export const Route = createFileRoute("/rede/")({
  head: () => ({
    meta: [
      { title: "Dashboard Geral — Sabor & Cia" },
      {
        name: "description",
        content:
          "Visão executiva da rede: faturamento, ranking, cancelamentos e ticket médio de todas as dark kitchens.",
      },
    ],
  }),
  component: GeneralDashboard,
});

const PLATFORM_LABEL: Record<string, string> = {
  ifood: "iFood",
  rappi: "Rappi",
  proprio: "Próprio",
};

type KpiUnidade = {
  unidade_id: number;
  unidade_nome: string;
  receita: number;
  pedidos: number;
  ticket_medio: number;
};

type FaturamentoSerie = {
  bucket: string;
  unidade_id: number;
  unidade_nome: string;
  total_pedidos: number;
  receita: number;
};

type CancelamentoPlataforma = {
  plataforma: string;
  total: number;
  cancelados: number;
  taxa: number;
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function GeneralDashboard() {
  const [period, setPeriod] = useState<PeriodId>("6m");
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [loading, setLoading] = useState(true);
  const [metaPeriodo, setMetaPeriodo] = useState(0);
  const [kpisUnidades, setKpisUnidades] = useState<KpiUnidade[]>([]);
  const [serieFaturamento, setSerieFaturamento] = useState<FaturamentoSerie[]>([]);
  const [cancelamento, setCancelamento] = useState<CancelamentoPlataforma[]>([]);
  const [granularidade, setGranularidade] = useState<Granularidade>("month");
  const [kpisUnidadesAnterior, setKpisUnidadesAnterior] = useState<KpiUnidade[]>([]);

  useEffect(() => {
    if (period === "custom" && (!customRange.inicio || !customRange.fim)) return;

    let active = true;
    setLoading(true);
    const { p_inicio, p_fim, granularidade: gran } = periodRange(period, customRange);
    const anterior = previousPeriodRange(p_inicio, p_fim);

    Promise.all([
      supabase.rpc("rpc_meta_periodo", { p_inicio, p_fim }),
      supabase.rpc("rpc_kpis_unidades", { p_inicio, p_fim }),
      supabase.rpc("rpc_faturamento_serie", { p_inicio, p_fim }),
      supabase.rpc("rpc_cancelamento_plataforma", { p_inicio, p_fim }),
      supabase.rpc("rpc_kpis_unidades", anterior),
    ]).then(([metaRes, kpisRes, serieRes, cancelamentoRes, kpisAnteriorRes]) => {
      if (!active) return;
      setMetaPeriodo(metaRes.data ?? 0);
      setKpisUnidades(kpisRes.data ?? []);
      setSerieFaturamento(serieRes.data ?? []);
      setCancelamento(cancelamentoRes.data ?? []);
      setKpisUnidadesAnterior(kpisAnteriorRes.data ?? []);
      setGranularidade(gran);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [period, customRange]);

  const ranking = useMemo(
    () => [...kpisUnidades].sort((a, b) => b.receita - a.receita),
    [kpisUnidades],
  );

  const receitaAnteriorPorUnidade = useMemo(() => {
    const map = new Map<number, number>();
    for (const u of kpisUnidadesAnterior) map.set(u.unidade_id, u.receita);
    return map;
  }, [kpisUnidadesAnterior]);

  const unidadesOrdenadas = useMemo(
    () => [...new Set(serieFaturamento.map((p) => p.unidade_id))].sort((a, b) => a - b),
    [serieFaturamento],
  );

  const chartData = useMemo(() => {
    const byBucket = new Map<string, Record<string, number | string>>();
    for (const row of serieFaturamento) {
      const key = row.bucket;
      if (!byBucket.has(key)) byBucket.set(key, { bucket: key });
      byBucket.get(key)![`unidade_${row.unidade_id}`] = Math.round(row.receita / 100) / 10;
    }
    return [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, row]) => ({
        ...row,
        label:
          granularidade === "month"
            ? parseDateOnly(bucket).toLocaleDateString("pt-BR", { month: "short" })
            : parseDateOnly(bucket).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              }),
      }));
  }, [serieFaturamento, granularidade]);

  const unidadeNomes = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of serieFaturamento) map.set(row.unidade_id, row.unidade_nome);
    return map;
  }, [serieFaturamento]);

  const cancelamentoChart = cancelamento.map((c) => ({
    name: PLATFORM_LABEL[c.plataforma] ?? c.plataforma,
    value: Math.round(c.taxa * 1000) / 10,
  }));

  const cancelamentoRedeTaxa = useMemo(() => {
    const total = cancelamento.reduce((s, c) => s + c.total, 0);
    const cancelados = cancelamento.reduce((s, c) => s + c.cancelados, 0);
    return total > 0 ? (cancelados / total) * 100 : 0;
  }, [cancelamento]);

  const receitaPeriodo = useMemo(
    () => kpisUnidades.reduce((s, u) => s + u.receita, 0),
    [kpisUnidades],
  );
  const pedidosPeriodo = useMemo(
    () => kpisUnidades.reduce((s, u) => s + u.pedidos, 0),
    [kpisUnidades],
  );

  const ticketMedioRede = pedidosPeriodo > 0 ? receitaPeriodo / pedidosPeriodo : 0;

  const receitaPeriodoAnterior = useMemo(
    () => kpisUnidadesAnterior.reduce((s, u) => s + u.receita, 0),
    [kpisUnidadesAnterior],
  );
  const pedidosPeriodoAnterior = useMemo(
    () => kpisUnidadesAnterior.reduce((s, u) => s + u.pedidos, 0),
    [kpisUnidadesAnterior],
  );
  const ticketMedioRedeAnterior =
    pedidosPeriodoAnterior > 0 ? receitaPeriodoAnterior / pedidosPeriodoAnterior : 0;

  const periodLabel = useMemo(() => computePeriodLabel(period, customRange), [period, customRange]);

  const granularidadeLabel =
    granularidade === "day"
      ? " · por dia"
      : granularidade === "week"
        ? " · por semana"
        : " · por mês";

  const gaugePct = metaPeriodo > 0 ? Math.round((receitaPeriodo / metaPeriodo) * 1000) / 10 : 0;

  const handleExportCSV = () => {
    exportCSV(
      "sabor-cia-ranking-unidades",
      ranking.map((u) => ({
        unidade: u.unidade_nome,
        faturamento: u.receita,
        pedidos: u.pedidos,
        ticket_medio: u.ticket_medio,
      })),
    );
  };

  const handleExportPDF = () => {
    exportPDF(
      "sabor-cia-dashboard-geral",
      "Sabor & Cia — Dashboard Geral",
      JSON.stringify({ period, receitaPeriodo, pedidosPeriodo, metaPeriodo, ranking }, null, 2),
    );
  };

  return (
    <>
      <TopBar
        title="Dashboard Geral"
        subtitle={`${kpisUnidades.length} unidades ativas na rede`}
        actions={
          <>
            <PeriodDropdown
              period={period}
              onPeriodChange={setPeriod}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || ranking.length === 0}
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
            <AlertsBadge />
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Meta do Período</p>
                      <p className="mt-1 font-display text-3xl font-bold tabular-nums">
                        {gaugePct.toFixed(1)}%
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {CURRENCY.format(receitaPeriodo)} de {CURRENCY.format(metaPeriodo)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                        Meta mensal prorrateada · {periodLabel}
                      </p>
                    </div>
                    <Gauge value={Math.min(100, gaugePct)} over={gaugePct > 100} />
                  </div>
                </CardContent>
              </Card>

              <KpiCard
                label="Ticket Médio Rede"
                value={CURRENCY.format(ticketMedioRede)}
                hint={periodLabel}
                delta={<KpiDelta current={ticketMedioRede} previous={ticketMedioRedeAnterior} />}
              />
              <KpiCard
                label="Cancelamentos"
                value={`${cancelamentoRedeTaxa.toFixed(1)}%`}
                hint={periodLabel}
                danger
              />
              <KpiCard
                label="Faturamento Total"
                value={CURRENCY.format(receitaPeriodo)}
                hint={`${pedidosPeriodo.toLocaleString("pt-BR")} pedidos · ${periodLabel}`}
                delta={<KpiDelta current={receitaPeriodo} previous={receitaPeriodoAnterior} />}
              />
            </div>

            {/* Chart + Ranking */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="font-display text-base">
                      Faturamento — {periodLabel.toLowerCase()}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Valores em milhares de reais (R$k)
                      {granularidadeLabel}
                    </p>
                  </div>
                  <Flame className="size-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${v}k`}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--surface-hover)" }}
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: number, name: string) => [`R$ ${v.toFixed(1)}k`, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                        {unidadesOrdenadas.map((id, i) => (
                          <Bar
                            key={id}
                            dataKey={`unidade_${id}`}
                            name={unidadeNomes.get(id) ?? `Unidade ${id}`}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                            radius={[3, 3, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="font-display text-base">Ranking por Faturamento</CardTitle>
                  <Trophy className="size-4 text-primary" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {ranking.length === 0 ? (
                    <EmptyState title="Sem dados" hint="Nenhum pedido no período selecionado." />
                  ) : (
                    ranking.map((u, i) => {
                      const pct = (u.receita / ranking[0].receita) * 100;
                      return (
                        <div key={u.unidade_id} className="space-y-1.5">
                          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                            <span className="w-5 font-mono text-xs text-muted-foreground">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <p className="min-w-0 truncate text-sm font-semibold">
                              {u.unidade_nome}
                            </p>
                            <div className="flex shrink-0 flex-col items-end">
                              <p className="text-right font-mono text-sm font-semibold tabular-nums">
                                {CURRENCY.format(u.receita)}
                              </p>
                              <MicroDelta
                                current={u.receita}
                                previous={receitaAnteriorPorUnidade.get(u.unidade_id) ?? 0}
                              />
                            </div>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-surface">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Avg ticket + cancellation breakdown */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle className="font-display text-base">Ticket médio por unidade</CardTitle>
                </CardHeader>
                <CardContent>
                  {kpisUnidades.length === 0 ? (
                    <EmptyState title="Sem dados" hint="Nenhum pedido no período selecionado." />
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {kpisUnidades.map((u) => (
                        <Link
                          key={u.unidade_id}
                          to="/unidade/$unidadeId"
                          params={{ unidadeId: String(u.unidade_id) }}
                          className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-hover"
                        >
                          <div className="flex items-center justify-between">
                            <p className="truncate text-xs font-medium text-muted-foreground">
                              {u.unidade_nome}
                            </p>
                            <Store className="size-3.5 text-muted-foreground" />
                          </div>
                          <p className="mt-1 font-display text-xl font-bold tabular-nums">
                            {CURRENCY.format(u.ticket_medio)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {u.pedidos.toLocaleString("pt-BR")} pedidos
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="font-display text-base">
                    Cancelamentos por plataforma
                  </CardTitle>
                  <TrendingDown className="size-4 text-primary" />
                </CardHeader>
                <CardContent>
                  {cancelamentoChart.length === 0 ? (
                    <EmptyState title="Sem dados" hint="Nenhum pedido no período selecionado." />
                  ) : (
                    <div className="h-[260px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={cancelamentoChart}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="45%"
                            innerRadius={45}
                            outerRadius={85}
                            paddingAngle={2}
                            stroke="var(--card)"
                          >
                            {cancelamentoChart.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            itemStyle={{ color: "var(--foreground)" }}
                            labelStyle={{ color: "var(--foreground)" }}
                            formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  hint,
  danger,
  delta,
}: {
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
  delta?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p
          className={`mt-1 font-display text-3xl font-bold tabular-nums ${danger ? "text-danger-tint-foreground" : ""}`}
        >
          {value}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        {delta && <div className="mt-1">{delta}</div>}
      </CardContent>
    </Card>
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

function Gauge({ value, over }: { value: number; over?: boolean }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const ringColor = over ? "var(--accent)" : "var(--success)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--surface-hover)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span
        className={`absolute text-[10px] font-semibold tabular-nums ${over ? "text-accent-tint-foreground" : "text-success-tint-foreground"}`}
      >
        {value.toFixed(0)}%
      </span>
    </div>
  );
}
