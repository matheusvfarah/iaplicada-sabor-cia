import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const DELTA_CAP = 999;

// Cor segue a seta sempre: subiu = verde, desceu = vermelho — não
// importa a métrica (mesmo em cancelamentos/tempo de preparo, onde
// subir é ruim). `invert` foi removido de propósito por pedido do
// usuário: cor por semântica de "bom/ruim" confundia mais do que
// ajudava.
function computeDelta(current: number, previous: number) {
  if (previous <= 0) return null;
  const pctRaw = ((current - previous) / previous) * 100;
  if (Math.abs(pctRaw) < 0.05) return null;
  const up = pctRaw > 0;
  const pctDisplay = Math.min(Math.abs(pctRaw), DELTA_CAP);
  const capped = Math.abs(pctRaw) > DELTA_CAP;
  return { up, pctDisplay, capped };
}

// Verde/vermelho só aqui: delta de KPI vs. período anterior (item 7 do
// design system). Pill compacta ABAIXO do número (nunca ao lado —
// número + delta lado a lado quebrava em telas menores), nowrap.
export function KpiDelta({
  current,
  previous,
  className,
}: {
  current: number;
  previous: number;
  className?: string;
}) {
  const delta = computeDelta(current, previous);
  if (!delta) return null;
  const { up, pctDisplay, capped } = delta;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums",
        up
          ? "bg-success-tint text-success-tint-foreground"
          : "bg-danger-tint text-danger-tint-foreground",
        className,
      )}
    >
      {up ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />}
      {capped ? "+" : ""}
      {pctDisplay.toFixed(0)}% vs. anterior
    </span>
  );
}

export function MicroDelta({ current, previous }: { current: number; previous: number }) {
  const delta = computeDelta(current, previous);
  if (!delta) return null;
  const { up, pctDisplay, capped } = delta;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-medium tabular-nums",
        up ? "text-success-tint-foreground" : "text-danger-tint-foreground",
      )}
    >
      {up ? <ArrowUp className="size-2.5 shrink-0" /> : <ArrowDown className="size-2.5 shrink-0" />}
      {capped ? "+" : ""}
      {pctDisplay.toFixed(0)}%
    </span>
  );
}
