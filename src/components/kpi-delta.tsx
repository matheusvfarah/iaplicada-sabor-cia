import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const DELTA_CAP = 999;

function computeDelta(current: number, previous: number, invert: boolean) {
  if (previous <= 0) return null;
  const pctRaw = ((current - previous) / previous) * 100;
  if (Math.abs(pctRaw) < 0.05) return null;
  const up = pctRaw > 0;
  // "Bom" é verde, "ruim" é vermelho — em métricas onde subir é ruim
  // (cancelamentos, tempo de preparo), o sinal visual se inverte.
  const positivo = invert ? !up : up;
  const pctDisplay = Math.min(Math.abs(pctRaw), DELTA_CAP);
  const capped = Math.abs(pctRaw) > DELTA_CAP;
  return { up, positivo, pctDisplay, capped };
}

// Verde/vermelho só aqui: delta de KPI vs. período anterior (item 7 do
// design system). Pill compacta ABAIXO do número (nunca ao lado —
// número + delta lado a lado quebrava em telas menores), nowrap.
export function KpiDelta({
  current,
  previous,
  invert = false,
  className,
}: {
  current: number;
  previous: number;
  invert?: boolean;
  className?: string;
}) {
  const delta = computeDelta(current, previous, invert);
  if (!delta) return null;
  const { up, positivo, pctDisplay, capped } = delta;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums",
        positivo
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

export function MicroDelta({
  current,
  previous,
  invert = false,
}: {
  current: number;
  previous: number;
  invert?: boolean;
}) {
  const delta = computeDelta(current, previous, invert);
  if (!delta) return null;
  const { up, positivo, pctDisplay, capped } = delta;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-medium tabular-nums",
        positivo ? "text-success-tint-foreground" : "text-danger-tint-foreground",
      )}
    >
      {up ? <ArrowUp className="size-2.5 shrink-0" /> : <ArrowDown className="size-2.5 shrink-0" />}
      {capped ? "+" : ""}
      {pctDisplay.toFixed(0)}%
    </span>
  );
}
