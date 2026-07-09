import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock, Download, FileText, Star, Target, TrendingUp, Trophy } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { PeriodFilter } from "@/components/period-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { CURRENCY, CURRENCY_FULL } from "@/lib/currency";
import { exportCSV, exportPDF } from "@/lib/export";
import { useUnit } from "@/lib/unit-context";
import {
  periodRange,
  periodLabel as computePeriodLabel,
  defaultCustomRange,
  type PeriodId,
} from "@/lib/period";

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
  plataforma: "ifood" | "rappi" | "proprio";
};

type ItemMaisVendido = {
  produto_id: number;
  nome: string;
  total_quantidade: number;
  total_receita: number;
};

const PLATFORM_LABEL: Record<string, string> = {
  ifood: "iFood",
  rappi: "Rappi",
  proprio: "Próprio",
};

export const Route = createFileRoute("/dashboard/unit/$unitId/")({
  head: () => ({
    meta: [{ title: "Dashboard da Unidade — Sabor & Cia" }],
  }),
  component: UnitDashboardIndex,
});

function UnitDashboardIndex() {
  const unit = useUnit();
  const [period, setPeriod] = useState<PeriodId>("6m");
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiUnidade | null>(null);
  const [top5, setTop5] = useState<Pedido[]>([]);
  const [tempoMedioPreparo, setTempoMedioPreparo] = useState<number | null>(null);
  const [itensMaisVendidos, setItensMaisVendidos] = useState<ItemMaisVendido[]>([]);

  useEffect(() => {
    if (period === "custom" && (!customRange.inicio || !customRange.fim)) return;
    let active = true;
    setLoading(true);
    const { p_inicio, p_fim } = periodRange(period, customRange);

    Promise.all([
      supabase.rpc("rpc_kpis_unidade_periodo", { p_unidade: unit.id, p_inicio, p_fim }),
      supabase
        .from("pedidos")
        .select("id, valor, plataforma")
        .eq("unidade_id", unit.id)
        .eq("status", "entregue")
        .gte("data_pedido", p_inicio)
        .lt("data_pedido", `${p_fim}T23:59:59`)
        .order("valor", { ascending: false })
        .limit(5),
      supabase.rpc("rpc_tempo_medio_preparo", { p_unidade: unit.id, p_inicio, p_fim }),
      supabase.rpc("rpc_itens_mais_vendidos", { p_unidade: unit.id, p_inicio, p_fim, p_limite: 5 }),
    ]).then(([kpisRes, top5Res, tempoRes, itensRes]) => {
      if (!active) return;
      setKpis(kpisRes.data?.[0] ?? null);
      setTop5(top5Res.data ?? []);
      setTempoMedioPreparo(tempoRes.data ?? null);
      setItensMaisVendidos(itensRes.data ?? []);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [unit.id, period, customRange]);

  const periodLbl = useMemo(() => computePeriodLabel(period, customRange), [period, customRange]);

  const goalPct =
    kpis?.meta && kpis.meta > 0 ? Math.min(100, ((kpis?.receita ?? 0) / kpis.meta) * 100) : 0;

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
        title={unit.nome}
        subtitle="Dashboard da unidade"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={handleExportCSV}
              disabled={loading}
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
            <AlertsBadge />
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Período
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
                Tempo médio de preparo
                <Clock className="size-3.5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <p className="font-display text-3xl font-bold">
                    {tempoMedioPreparo != null ? `${tempoMedioPreparo.toFixed(0)} min` : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{periodLbl}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Itens mais vendidos
                <TrendingUp className="size-3.5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : itensMaisVendidos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
              ) : (
                itensMaisVendidos.slice(0, 3).map((item) => (
                  <div key={item.produto_id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-muted-foreground">{item.nome}</span>
                    <span className="shrink-0 font-mono font-semibold">
                      {item.total_quantidade}×
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="font-display text-base">Top 5 pedidos por valor</CardTitle>
            <Trophy className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : top5.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido entregue nesse período.</p>
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
    </>
  );
}
