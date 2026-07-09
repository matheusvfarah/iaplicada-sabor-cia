export const PERIODS = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "6m", label: "6 meses" },
  { id: "ytd", label: "Ano" },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"] | "custom";
export type Granularidade = "day" | "week" | "month";
export type CustomRange = { inicio: string; fim: string };

export function toDateParam(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parseia "YYYY-MM-DD" como data local (evita o Date nativo interpretar
// como UTC e deslocar pro dia/mês anterior em fusos negativos, ex. Brasil).
export function parseDateOnly(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function granularidadePorDias(dias: number): Granularidade {
  if (dias <= 10) return "day";
  if (dias <= 60) return "week";
  return "month";
}

export function periodRange(period: PeriodId, custom: CustomRange) {
  if (period === "custom") {
    const inicio = parseDateOnly(custom.inicio);
    const fim = parseDateOnly(custom.fim);
    const dias = Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000));
    return {
      p_inicio: custom.inicio,
      p_fim: custom.fim,
      granularidade: granularidadePorDias(dias),
    };
  }

  const fim = new Date();
  let inicio: Date;
  if (period === "7d") {
    inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - 6);
  } else if (period === "30d") {
    inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - 29);
  } else if (period === "6m") {
    // 1º dia do mês, 5 meses atrás — garante 6 meses cheios no gráfico
    // (mês atual + 5 anteriores), em vez de cortar o mês limite ao meio.
    inicio = new Date(fim.getFullYear(), fim.getMonth() - 5, 1);
  } else {
    inicio = new Date(fim.getFullYear(), 0, 1);
  }
  const p_inicio = toDateParam(inicio);
  const p_fim = toDateParam(fim);
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
  return { p_inicio, p_fim, granularidade: granularidadePorDias(dias) };
}

// Período imediatamente anterior, com a mesma duração — usado pros
// deltas "↑/↓ vs. período anterior" (item 7 do design system).
export function previousPeriodRange(p_inicio: string, p_fim: string) {
  const inicio = parseDateOnly(p_inicio);
  const fim = parseDateOnly(p_fim);
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1;
  const prevFim = new Date(inicio);
  prevFim.setDate(prevFim.getDate() - 1);
  const prevInicio = new Date(prevFim);
  prevInicio.setDate(prevInicio.getDate() - (dias - 1));
  return { p_inicio: toDateParam(prevInicio), p_fim: toDateParam(prevFim) };
}

export function defaultCustomRange(): CustomRange {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - 13);
  return { inicio: toDateParam(inicio), fim: toDateParam(fim) };
}

export function periodLabel(period: PeriodId, custom: CustomRange) {
  if (period !== "custom") return PERIODS.find((p) => p.id === period)?.label ?? "";
  if (!custom.inicio || !custom.fim) return "Personalizado";
  const fmt = (v: string) =>
    parseDateOnly(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(custom.inicio)} – ${fmt(custom.fim)}`;
}
