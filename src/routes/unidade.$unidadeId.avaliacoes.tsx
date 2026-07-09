import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Star, MessageSquareOff, Download, FileText, ChevronDown } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { NotificationsBell } from "@/components/notifications-bell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodDropdown } from "@/components/period-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { CURRENCY_FULL } from "@/lib/currency";
import { exportCsv, exportPdf, type ExportDataset } from "@/lib/export";
import { formatRelativeTime } from "@/lib/format-time";
import { useUnit } from "@/lib/unit-context";
import {
  periodRange,
  periodLabel as computePeriodLabel,
  defaultCustomRange,
  type PeriodId,
} from "@/lib/period";
import { cn } from "@/lib/utils";

type Plataforma = "ifood" | "rappi" | "proprio";

type Avaliacao = {
  id: number;
  nota: number;
  comentario: string | null;
  data: string;
  pedido_id: number;
  pedido_codigo: string | null;
  pedido_valor: number;
  pedido_plataforma: Plataforma;
};

const PLATFORM_LABEL: Record<Plataforma, string> = {
  ifood: "iFood",
  rappi: "Rappi",
  proprio: "Próprio",
};

export const Route = createFileRoute("/unidade/$unidadeId/avaliacoes")({
  head: () => ({ meta: [{ title: "Avaliações — Sabor & Cia" }] }),
  component: AvaliacoesPage,
});

function Estrelas({ nota, size = "size-3.5" }: { nota: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(size, i < nota ? "fill-accent text-accent" : "text-muted-foreground/30")}
        />
      ))}
    </div>
  );
}

function AvaliacoesPage() {
  const unit = useUnit();
  const [loading, setLoading] = useState(true);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [notasFiltro, setNotasFiltro] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (period === "custom" && (!customRange.inicio || !customRange.fim)) return;
    let active = true;
    setLoading(true);
    const { p_inicio, p_fim } = periodRange(period, customRange);

    supabase
      .rpc("rpc_avaliacoes_unidade", { p_unidade: unit.id, p_inicio, p_fim })
      .then(({ data }) => {
        if (!active) return;
        setAvaliacoes((data as Avaliacao[]) ?? []);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [unit.id, period, customRange]);

  // Resumo (média, total, distribuição) reflete só o período — os
  // chips de nota abaixo filtram a LISTA, não o resumo, senão marcar
  // "1 estrela" faria a média do topo mentir sobre o período inteiro.
  const total = avaliacoes.length;
  const mediaNota = total > 0 ? avaliacoes.reduce((s, a) => s + a.nota, 0) / total : 0;
  const distribuicao = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const a of avaliacoes) counts[a.nota - 1] += 1;
    return [5, 4, 3, 2, 1].map((nota) => ({ nota, count: counts[nota - 1] }));
  }, [avaliacoes]);

  function toggleNota(nota: number) {
    setNotasFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(nota)) next.delete(nota);
      else next.add(nota);
      return next;
    });
  }

  const filtradas = useMemo(() => {
    if (notasFiltro.size === 0) return avaliacoes;
    return avaliacoes.filter((a) => notasFiltro.has(a.nota));
  }, [avaliacoes, notasFiltro]);

  const periodLbl = computePeriodLabel(period, customRange);

  const buildExportDataset = (): ExportDataset => ({
    page: `unidade-${unit.id}-avaliacoes`,
    title: `${unit.nome} — Avaliações`,
    period:
      notasFiltro.size > 0
        ? `${periodLbl} · notas: ${[...notasFiltro].sort().join(", ")}`
        : periodLbl,
    sections: [
      {
        columns: [
          { header: "Nota", value: (r: Avaliacao) => r.nota },
          { header: "Comentário", value: (r: Avaliacao) => r.comentario ?? "" },
          { header: "Pedido", value: (r: Avaliacao) => r.pedido_codigo ?? `#${r.pedido_id}` },
          { header: "Plataforma", value: (r: Avaliacao) => PLATFORM_LABEL[r.pedido_plataforma] },
          { header: "Valor", value: (r: Avaliacao) => CURRENCY_FULL.format(r.pedido_valor) },
          {
            header: "Data",
            value: (r: Avaliacao) =>
              new Date(r.data).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
          },
        ],
        rows: filtradas,
      },
    ],
  });

  const handleExportCSV = () => exportCsv(buildExportDataset());
  const handleExportPDF = () => exportPdf(buildExportDataset());

  return (
    <>
      <TopBar
        title="Avaliações"
        subtitle={unit.nome}
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
                  disabled={loading || filtradas.length === 0}
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
          </>
        }
      />

      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardContent className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center">
            {loading ? (
              <Skeleton className="h-20 w-full sm:w-32" />
            ) : (
              <div className="flex shrink-0 flex-col items-center gap-1 sm:w-32">
                <p className="font-display text-4xl font-bold tabular-nums">
                  {mediaNota.toFixed(1)}
                </p>
                <Estrelas nota={Math.round(mediaNota)} />
                <p className="text-[11px] text-muted-foreground">
                  {total} avaliaç{total === 1 ? "ão" : "ões"}
                </p>
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5">
              {loading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                distribuicao.map(({ nota, count }) => {
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={nota} className="flex items-center gap-2">
                      <span className="w-3 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {nota}
                      </span>
                      <Star className="size-3 shrink-0 fill-accent text-accent" />
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            nota <= 2 ? "bg-danger-tint-foreground/40" : "bg-success/40",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Nota:</span>
          {[5, 4, 3, 2, 1].map((nota) => (
            <button
              key={nota}
              onClick={() => toggleNota(nota)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                notasFiltro.has(nota)
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-border-strong",
              )}
            >
              {nota}
              <Star className="size-3" />
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : filtradas.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <MessageSquareOff className="mb-3 size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma avaliação</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Ajuste o período ou o filtro de nota.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map((a) => (
              <Card key={a.id} className={cn(a.nota <= 2 && "border-l-2 border-l-destructive")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Estrelas nota={a.nota} />
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(a.data)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-sm",
                      a.comentario ? "text-foreground" : "italic text-muted-foreground",
                    )}
                  >
                    {a.comentario ?? "Sem comentário"}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {a.pedido_codigo ?? `#${a.pedido_id}`}
                    </Badge>
                    <span>{PLATFORM_LABEL[a.pedido_plataforma]}</span>
                    <span>·</span>
                    <span className="font-mono">{CURRENCY_FULL.format(a.pedido_valor)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
