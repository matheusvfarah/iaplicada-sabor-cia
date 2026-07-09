import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Download, FileText, Flame, Store, TrendingDown, Trophy } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { CURRENCY } from "@/lib/currency";
import { exportCSV, exportPDF } from "@/lib/export";

export const Route = createFileRoute("/dashboard/")({
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

const PERIODS = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "6m", label: "6 meses" },
  { id: "ytd", label: "Ano" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

const PLATFORM_LABEL: Record<string, string> = {
  ifood: "iFood",
  rappi: "Rappi",
  proprio: "Próprio",
};

type ResumoMes = {
  receita_total: number;
  meta_total: number;
  pct_meta: number | null;
  total_pedidos: number;
};

type KpiUnidade = {
  unidade_id: number;
  unidade_nome: string;
  receita: number;
  pedidos: number;
  ticket_medio: number;
};

type Pedidos6m = {
  mes: string;
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

function periodRange(period: PeriodId) {
  const fim = new Date();
  const inicio = new Date(fim);
  if (period === "7d") inicio.setDate(inicio.getDate() - 6);
  else if (period === "30d") inicio.setDate(inicio.getDate() - 29);
  else if (period === "6m") inicio.setMonth(inicio.getMonth() - 6);
  else inicio.setMonth(0, 1);
  return {
    p_inicio: inicio.toISOString().slice(0, 10),
    p_fim: fim.toISOString().slice(0, 10),
  };
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function GeneralDashboard() {
  const [period, setPeriod] = useState<PeriodId>("6m");
  const [loading, setLoading] = useState(true);
  const [resumo, setResumo] = useState<ResumoMes | null>(null);
  const [kpisUnidades, setKpisUnidades] = useState<KpiUnidade[]>([]);
  const [pedidos6m, setPedidos6m] = useState<Pedidos6m[]>([]);
  const [cancelamento, setCancelamento] = useState<CancelamentoPlataforma[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const { p_inicio, p_fim } = periodRange(period);

    Promise.all([
      supabase.rpc("rpc_resumo_mes"),
      supabase.rpc("rpc_kpis_unidades", { p_inicio, p_fim }),
      supabase.rpc("rpc_pedidos_6m"),
      supabase.rpc("rpc_cancelamento_plataforma", { p_inicio, p_fim }),
    ]).then(([resumoRes, kpisRes, pedidos6mRes, cancelamentoRes]) => {
      if (!active) return;
      setResumo(resumoRes.data?.[0] ?? null);
      setKpisUnidades(kpisRes.data ?? []);
      setPedidos6m(pedidos6mRes.data ?? []);
      setCancelamento(cancelamentoRes.data ?? []);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [period]);

  const ranking = useMemo(
    () => [...kpisUnidades].sort((a, b) => b.receita - a.receita),
    [kpisUnidades],
  );

  const unidadesOrdenadas = useMemo(
    () => [...new Set(pedidos6m.map((p) => p.unidade_id))].sort((a, b) => a - b),
    [pedidos6m],
  );

  const monthlyChartData = useMemo(() => {
    const byMonth = new Map<string, Record<string, number | string>>();
    for (const row of pedidos6m) {
      const key = row.mes;
      if (!byMonth.has(key)) byMonth.set(key, { mes: key });
      byMonth.get(key)![`unidade_${row.unidade_id}`] = row.receita / 1000;
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, row]) => ({
        ...row,
        label: new Date(mes).toLocaleDateString("pt-BR", { month: "short" }),
      }));
  }, [pedidos6m]);

  const unidadeNomes = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of pedidos6m) map.set(row.unidade_id, row.unidade_nome);
    return map;
  }, [pedidos6m]);

  const cancelamentoChart = cancelamento.map((c) => ({
    name: PLATFORM_LABEL[c.plataforma] ?? c.plataforma,
    value: Math.round(c.taxa * 1000) / 10,
  }));

  const cancelamentoRedeTaxa = useMemo(() => {
    const total = cancelamento.reduce((s, c) => s + c.total, 0);
    const cancelados = cancelamento.reduce((s, c) => s + c.cancelados, 0);
    return total > 0 ? (cancelados / total) * 100 : 0;
  }, [cancelamento]);

  const ticketMedioRede = useMemo(() => {
    const receita = kpisUnidades.reduce((s, u) => s + u.receita, 0);
    const pedidos = kpisUnidades.reduce((s, u) => s + u.pedidos, 0);
    return pedidos > 0 ? receita / pedidos : 0;
  }, [kpisUnidades]);

  const gaugePct = Math.round((resumo?.pct_meta ?? 0) * 1000) / 10;

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
      JSON.stringify({ period, resumo, ranking }, null, 2),
    );
  };

  return (
    <>
      <TopBar
        title="Dashboard Geral"
        subtitle={`${kpisUnidades.length} unidades ativas na rede`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={handleExportCSV}
              disabled={loading || ranking.length === 0}
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
            <div className="flex size-2 items-center justify-center">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
            </div>
            <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
              Live
            </span>
            <AlertsBadge />
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Filter row */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Período
            </p>
            <p className="mt-1 font-display text-lg font-semibold">
              Últimos {PERIODS.find((p) => p.id === period)?.label.toLowerCase()}
            </p>
          </div>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodId)}>
            <TabsList>
              {PERIODS.map((p) => (
                <TabsTrigger key={p.id} value={p.id}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

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
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Meta do Mês
                      </p>
                      <p className="mt-1 font-display text-3xl font-bold">{gaugePct.toFixed(1)}%</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {CURRENCY.format(resumo?.receita_total ?? 0)} de{" "}
                        {CURRENCY.format(resumo?.meta_total ?? 0)}
                      </p>
                    </div>
                    <Gauge value={Math.min(100, gaugePct)} />
                  </div>
                </CardContent>
              </Card>

              <KpiCard
                label="Ticket Médio Rede"
                value={CURRENCY.format(ticketMedioRede)}
                hint={`${PERIODS.find((p) => p.id === period)?.label}`}
              />
              <KpiCard
                label="Cancelamentos"
                value={`${cancelamentoRedeTaxa.toFixed(1)}%`}
                hint={`${PERIODS.find((p) => p.id === period)?.label}`}
                accent
              />
              <KpiCard
                label="Faturamento Total"
                value={CURRENCY.format(resumo?.receita_total ?? 0)}
                hint={`${(resumo?.total_pedidos ?? 0).toLocaleString("pt-BR")} pedidos no mês`}
              />
            </div>

            {/* Chart + Ranking */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="font-display text-base">
                      Faturamento — últimos 6 meses
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Valores em milhares de reais (R$k)
                    </p>
                  </div>
                  <Flame className="size-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlyChartData}
                        margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                      >
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
                          formatter={(v: number) => [`R$ ${v}k`, ""]}
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
                            <p className="shrink-0 text-right font-mono text-sm font-semibold">
                              {CURRENCY.format(u.receita)}
                            </p>
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
                        <div
                          key={u.unidade_id}
                          className="rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
                        >
                          <div className="flex items-center justify-between">
                            <p className="truncate text-xs font-medium text-muted-foreground">
                              {u.unidade_nome}
                            </p>
                            <Store className="size-3.5 text-muted-foreground" />
                          </div>
                          <p className="mt-1 font-display text-xl font-bold">
                            {CURRENCY.format(u.ticket_medio)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {u.pedidos.toLocaleString("pt-BR")} pedidos
                          </p>
                        </div>
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
                            formatter={(v: number) => [`${v}%`, ""]}
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
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 font-display text-3xl font-bold ${accent ? "text-primary" : ""}`}>
          {value}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
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

function Gauge({ value }: { value: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
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
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="absolute font-mono text-[10px] font-semibold text-primary">
        {value.toFixed(0)}%
      </span>
    </div>
  );
}
