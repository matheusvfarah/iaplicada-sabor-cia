import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Ban, Clock, Download, FileText, Star, Target, Trophy, ChevronDown } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { PeriodFilter } from "@/components/period-filter";
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
import { CURRENCY, CURRENCY_FULL } from "@/lib/currency";
import { exportCSV, exportPDF } from "@/lib/export";
import { useUnit } from "@/lib/unit-context";
import { useSession } from "@/lib/auth";
import { greetingForHour } from "@/lib/greeting";
import {
  parseDateOnly,
  periodRange,
  previousPeriodRange,
  periodLabel as computePeriodLabel,
  defaultCustomRange,
  type PeriodId,
} from "@/lib/period";
import { KpiDelta } from "@/components/kpi-delta";

type Plataforma = "ifood" | "rappi" | "proprio";

type KpiUnidade = {
  receita: number;
  meta: number | null;
  pct_meta: number | null;
  nota_media: number | null;
  total_avaliacoes: number;
};

type Pedido = {
  id: number;
  valor: number;
  plataforma: Plataforma;
};

type ItemMaisVendido = {
  produto_id: number;
  nome: string;
  total_quantidade: number;
  total_receita: number;
};

type FaturamentoSerie = {
  bucket: string;
  unidade_id: number;
  receita: number;
};

const PLATFORM_LABEL: Record<Plataforma, string> = {
  ifood: "iFood",
  rappi: "Rappi",
  proprio: "Próprio",
};

// Cores de badge de plataforma do design system (danger/accent/success).
const PLATFORM_COLOR: Record<Plataforma, string> = {
  ifood: "var(--destructive)",
  rappi: "var(--accent)",
  proprio: "var(--success)",
};

export const Route = createFileRoute("/dashboard/unit/$unitId/")({
  head: () => ({
    meta: [{ title: "Dashboard da Unidade — Sabor & Cia" }],
  }),
  component: UnitDashboardIndex,
});

function UnitDashboardIndex() {
  const unit = useUnit();
  const { session } = useSession();
  const primeiroNome = session?.profile.nome.split(" ")[0];
  const [period, setPeriod] = useState<PeriodId>("6m");
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiUnidade | null>(null);
  const [top5, setTop5] = useState<Pedido[]>([]);
  const [tempoMedioPreparo, setTempoMedioPreparo] = useState<number | null>(null);
  const [itensMaisVendidos, setItensMaisVendidos] = useState<ItemMaisVendido[]>([]);
  const [cancelamentos, setCancelamentos] = useState(0);
  const [plataformas, setPlataformas] = useState<Record<Plataforma, number>>({
    ifood: 0,
    rappi: 0,
    proprio: 0,
  });
  const [serieFaturamento, setSerieFaturamento] = useState<FaturamentoSerie[]>([]);
  const [receitaAnterior, setReceitaAnterior] = useState(0);

  useEffect(() => {
    if (period === "custom" && (!customRange.inicio || !customRange.fim)) return;
    let active = true;
    setLoading(true);
    const { p_inicio, p_fim } = periodRange(period, customRange);
    const fimLimite = `${p_fim}T23:59:59`;
    const anterior = previousPeriodRange(p_inicio, p_fim);

    Promise.all([
      supabase.rpc("rpc_kpis_unidade_periodo", { p_unidade: unit.id, p_inicio, p_fim }),
      supabase.rpc("rpc_kpis_unidade_periodo", {
        p_unidade: unit.id,
        p_inicio: anterior.p_inicio,
        p_fim: anterior.p_fim,
      }),
      supabase
        .from("pedidos")
        .select("id, valor, plataforma")
        .eq("unidade_id", unit.id)
        .eq("status", "entregue")
        .gte("data_pedido", p_inicio)
        .lt("data_pedido", fimLimite)
        .order("valor", { ascending: false })
        .limit(5),
      supabase.rpc("rpc_tempo_medio_preparo", { p_unidade: unit.id, p_inicio, p_fim }),
      supabase.rpc("rpc_itens_mais_vendidos", { p_unidade: unit.id, p_inicio, p_fim, p_limite: 5 }),
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("unidade_id", unit.id)
        .eq("status", "cancelado")
        .gte("data_pedido", p_inicio)
        .lt("data_pedido", fimLimite),
      supabase
        .from("pedidos")
        .select("plataforma")
        .eq("unidade_id", unit.id)
        .gte("data_pedido", p_inicio)
        .lt("data_pedido", fimLimite),
      supabase.rpc("rpc_faturamento_serie", { p_inicio, p_fim }),
    ]).then(
      ([
        kpisRes,
        kpisAnteriorRes,
        top5Res,
        tempoRes,
        itensRes,
        cancelamentosRes,
        plataformasRes,
        serieRes,
      ]) => {
        if (!active) return;
        setKpis(kpisRes.data?.[0] ?? null);
        setReceitaAnterior(kpisAnteriorRes.data?.[0]?.receita ?? 0);
        setTop5(top5Res.data ?? []);
        setTempoMedioPreparo(tempoRes.data ?? null);
        setItensMaisVendidos(itensRes.data ?? []);
        setCancelamentos(cancelamentosRes.count ?? 0);
        const counts: Record<Plataforma, number> = { ifood: 0, rappi: 0, proprio: 0 };
        for (const row of (plataformasRes.data ?? []) as { plataforma: Plataforma }[]) {
          counts[row.plataforma] += 1;
        }
        setPlataformas(counts);
        setSerieFaturamento(
          ((serieRes.data ?? []) as FaturamentoSerie[]).filter((r) => r.unidade_id === unit.id),
        );
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, [unit.id, period, customRange]);

  const periodLbl = useMemo(() => computePeriodLabel(period, customRange), [period, customRange]);

  const goalPctRaw =
    kpis?.meta && kpis.meta > 0 ? ((kpis?.receita ?? 0) / kpis.meta) * 100 : 0;
  const goalScaleMax = Math.max(100, goalPctRaw);
  const goalTrackPct = (Math.min(100, goalPctRaw) / goalScaleMax) * 100;
  const goalOverPct = goalPctRaw > 100 ? ((goalPctRaw - 100) / goalScaleMax) * 100 : 0;

  const metaDiariaMedia = useMemo(() => {
    if (!kpis?.meta || serieFaturamento.length === 0) return 0;
    return kpis.meta / serieFaturamento.length;
  }, [kpis?.meta, serieFaturamento.length]);

  const chartData = useMemo(
    () =>
      serieFaturamento
        .slice()
        .sort((a, b) => a.bucket.localeCompare(b.bucket))
        .map((row) => ({
          label: parseDateOnly(row.bucket).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          }),
          receita: row.receita,
          acimaMeta: metaDiariaMedia > 0 && row.receita >= metaDiariaMedia,
        })),
    [serieFaturamento, metaDiariaMedia],
  );

  const platformChart = (Object.keys(PLATFORM_LABEL) as Plataforma[])
    .map((p) => ({ id: p, name: PLATFORM_LABEL[p], value: plataformas[p] }))
    .filter((p) => p.value > 0);

  const handleExportCSV = () => {
    exportCSV(
      `sabor-cia-unidade-${unit.id}-top5`,
      top5.map((o) => ({ id: o.id, plataforma: PLATFORM_LABEL[o.plataforma], valor: o.valor })),
    );
  };

  const handleExportPDF = () => {
    exportPDF(
      `sabor-cia-unidade-${unit.id}`,
      `Sabor & Cia — ${unit.nome}`,
      JSON.stringify({ unit, period, kpis, top5, tempoMedioPreparo, itensMaisVendidos }, null, 2),
    );
  };

  return (
    <>
      <TopBar
        title={primeiroNome ? `${greetingForHour()}, ${primeiroNome}` : unit.nome}
        subtitle={unit.nome}
        actions={
          <>
            <PeriodFilter
              period={period}
              onPeriodChange={setPeriod}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={loading} className="gap-1.5">
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
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-[11px] text-muted-foreground">
                Receita vs. meta
                <Target className="size-3.5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <p className="font-display text-3xl font-bold tabular-nums">
                      {CURRENCY.format(kpis?.receita ?? 0)}
                    </p>
                    <KpiDelta current={kpis?.receita ?? 0} previous={receitaAnterior} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Meta prorrateada: {CURRENCY.format(kpis?.meta ?? 0)}
                  </p>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-success transition-all"
                      style={{ width: `${goalTrackPct}%` }}
                    />
                    {goalOverPct > 0 && (
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${goalOverPct}%` }}
                      />
                    )}
                  </div>
                  <p
                    className={`mt-1 text-right text-[11px] tabular-nums ${
                      goalPctRaw > 100 ? "text-accent-tint-foreground" : "text-success-tint-foreground"
                    }`}
                  >
                    {goalPctRaw.toFixed(1)}% da meta
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-[11px] text-muted-foreground">
                Nota do período
                <Star className="size-3.5 fill-accent text-accent" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <p className="font-display text-3xl font-bold tabular-nums">
                      {kpis?.nota_media ? kpis.nota_media.toFixed(1) : "—"}
                    </p>
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`size-3.5 ${
                            kpis?.nota_media && i < Math.round(kpis.nota_media)
                              ? "fill-accent text-accent"
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
              <CardTitle className="flex items-center justify-between text-[11px] text-muted-foreground">
                Tempo médio de preparo
                <Clock className="size-3.5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <p className="font-display text-3xl font-bold tabular-nums">
                    {tempoMedioPreparo != null ? `${tempoMedioPreparo.toFixed(0)} min` : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{periodLbl}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-[11px] text-muted-foreground">
                Cancelamentos
                <Ban className="size-3.5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <p className="font-display text-3xl font-bold tabular-nums">{cancelamentos}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{periodLbl}</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Receita por dia</CardTitle>
              <p className="text-xs text-muted-foreground">
                Verde acima da meta diária média do período
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : chartData.length === 0 ? (
                <EmptyState hint="Nenhum pedido entregue nesse período." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="receitaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
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
                        tickFormatter={(v) => CURRENCY.format(v).replace(/,00$/, "")}
                        width={64}
                      />
                      <Tooltip
                        cursor={{ stroke: "var(--border)" }}
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => [CURRENCY_FULL.format(v), "Receita"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="receita"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        fill="url(#receitaFill)"
                        dot={(props: { cx?: number; cy?: number; payload?: { acimaMeta: boolean } }) => {
                          const { cx, cy, payload } = props;
                          if (cx == null || cy == null) return <g key={`${cx}-${cy}`} />;
                          return (
                            <circle
                              key={`${cx}-${cy}`}
                              cx={cx}
                              cy={cy}
                              r={3}
                              fill={payload?.acimaMeta ? "var(--success)" : "var(--primary)"}
                              stroke="none"
                            />
                          );
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Pedidos por plataforma</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : platformChart.length === 0 ? (
                <EmptyState hint="Nenhum pedido nesse período." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={platformChart}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="45%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                        stroke="var(--card)"
                      >
                        {platformChart.map((p) => (
                          <Cell key={p.id} fill={PLATFORM_COLOR[p.id]} />
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
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top pedidos + itens mais vendidos */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="font-display text-base">Top 5 pedidos por valor</CardTitle>
              <Trophy className="size-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              ) : top5.length === 0 ? (
                <EmptyState hint="Nenhum pedido entregue nesse período." />
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="font-display text-base">Itens mais vendidos</CardTitle>
              <Target className="size-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              ) : itensMaisVendidos.length === 0 ? (
                <EmptyState hint="Sem dados nesse período." />
              ) : (
                itensMaisVendidos.map((item) => (
                  <div
                    key={item.produto_id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
                  >
                    <p className="min-w-0 truncate text-sm font-semibold">{item.nome}</p>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.total_quantidade}×
                      </span>
                      <span className="font-mono text-sm font-semibold">
                        {CURRENCY_FULL.format(item.total_receita)}
                      </span>
                    </div>
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

function EmptyState({ hint }: { hint: string }) {
  return (
    <div className="grid h-40 place-items-center text-center">
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
