import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import {
  ArrowUpRight,
  Download,
  FileText,
  Flame,
  Store,
  TrendingDown,
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  CURRENCY,
  MONTHLY_REVENUE,
  NETWORK_KPIS,
  UNITS,
} from "@/lib/mock-data";
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

const statusStyle: Record<
  string,
  { label: string; className: string }
> = {
  operational: {
    label: "Operacional",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  rush: {
    label: "Rush Hour",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  idle: {
    label: "Ocioso",
    className: "bg-muted text-muted-foreground border-border",
  },
  offline: {
    label: "Offline",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

function GeneralDashboard() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("6m");

  const ranking = useMemo(
    () => [...UNITS].sort((a, b) => b.revenueMonth - a.revenueMonth),
    [],
  );

  const cancellationByPlatform = [
    { name: "iFood", value: 42 },
    { name: "Rappi", value: 28 },
    { name: "UberEats", value: 18 },
    { name: "Próprio", value: 12 },
  ];

  const gaugePct = NETWORK_KPIS.deliveryRate;

  const handleExportCSV = () => {
    exportCSV(
      "sabor-cia-ranking-unidades",
      ranking.map((u) => ({
        unidade: u.name,
        cidade: u.city,
        status: u.status,
        faturamento: u.revenueMonth,
        meta: u.goalMonth,
        pedidos: u.ordersMonth,
        ticket_medio: u.avgTicket,
        avaliacao: u.rating,
      })),
    );
  };

  const handleExportPDF = () => {
    exportPDF(
      "sabor-cia-dashboard-geral",
      "Sabor & Cia — Dashboard Geral",
      JSON.stringify(
        { period, kpis: NETWORK_KPIS, ranking },
        null,
        2,
      ),
    );
  };

  return (
    <>
      <TopBar
        title="Dashboard Geral"
        subtitle={`${UNITS.length} unidades ativas na rede`}
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
            <div className="flex size-2 items-center justify-center">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
            </div>
            <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
              Live
            </span>
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
          <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <TabsList>
              {PERIODS.map((p) => (
                <TabsTrigger key={p.id} value={p.id}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Taxa de Entrega
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold">
                    {gaugePct.toFixed(1)}%
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                    <ArrowUpRight className="size-3" />
                    +{NETWORK_KPIS.deliveryRateTrend}% vs mês ant.
                  </p>
                </div>
                <Gauge value={gaugePct} />
              </div>
            </CardContent>
          </Card>

          <KpiCard
            label="Ticket Médio Rede"
            value={CURRENCY.format(NETWORK_KPIS.avgTicket)}
            hint="Pico às 20:00h"
            trend="+4.8%"
          />
          <KpiCard
            label="Cancelamentos"
            value={`${NETWORK_KPIS.cancellationRate}%`}
            hint={`Meta < ${NETWORK_KPIS.cancellationTarget}%`}
            trend="-0.4%"
            trendPositive
            accent
          />
          <KpiCard
            label="Faturamento Total"
            value={CURRENCY.format(NETWORK_KPIS.totalRevenue)}
            hint={`${NETWORK_KPIS.totalOrders.toLocaleString("pt-BR")} pedidos`}
            trend="+12.5%"
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
                    data={MONTHLY_REVENUE}
                    margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
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
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      iconType="circle"
                    />
                    <Bar dataKey="centro" name="Centro" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="jardins" name="Jardins" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="vila" name="Vila Madalena" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="batel" name="Batel" fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="leblon" name="Leblon" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="font-display text-base">
                Ranking por Faturamento
              </CardTitle>
              <Trophy className="size-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-3">
              {ranking.map((u, i) => {
                const pct = (u.revenueMonth / ranking[0].revenueMonth) * 100;
                return (
                  <div key={u.id} className="space-y-1.5">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                      <span className="w-5 font-mono text-xs text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {u.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`h-4 px-1.5 text-[9px] font-medium ${statusStyle[u.status].className}`}
                          >
                            {statusStyle[u.status].label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {u.city}
                          </span>
                        </div>
                      </div>
                      <p className="shrink-0 text-right font-mono text-sm font-semibold">
                        {CURRENCY.format(u.revenueMonth)}
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
              })}
            </CardContent>
          </Card>
        </div>

        {/* Avg ticket + cancellation breakdown */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="font-display text-base">
                Ticket médio por unidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {UNITS.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {u.name}
                      </p>
                      <Store className="size-3.5 text-muted-foreground" />
                    </div>
                    <p className="mt-1 font-display text-xl font-bold">
                      {CURRENCY.format(u.avgTicket)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {u.ordersMonth.toLocaleString("pt-BR")} pedidos • ★ {u.rating}
                    </p>
                  </div>
                ))}
              </div>
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
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cancellationByPlatform}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="var(--card)"
                    >
                      {cancellationByPlatform.map((_, i) => (
                        <Cell
                          key={i}
                          fill={`var(--chart-${i + 1})`}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  hint,
  trend,
  trendPositive,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  trend?: string;
  trendPositive?: boolean;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p
          className={`mt-1 font-display text-3xl font-bold ${accent ? "text-primary" : ""}`}
        >
          {value}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">{hint}</p>
          {trend && (
            <span
              className={`text-[11px] font-medium ${trendPositive === false ? "text-destructive" : "text-emerald-500"}`}
            >
              {trend}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
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
        ON
      </span>
    </div>
  );
}