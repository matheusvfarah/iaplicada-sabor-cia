import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Verde/vermelho só aqui: delta de KPI vs. período anterior (item 7
// do design system — a bandeira entra com parcimônia, só onde há
// significado de alta/baixa).
export function KpiDelta({
  current,
  previous,
  className,
}: {
  current: number;
  previous: number;
  className?: string;
}) {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return null;
  const up = pct > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
        up ? "text-success-tint-foreground" : "text-danger-tint-foreground",
        className,
      )}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(pct).toFixed(1)}% vs. período anterior
    </span>
  );
}

export function MicroDelta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return null;
  const up = pct > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums",
        up ? "text-success-tint-foreground" : "text-danger-tint-foreground",
      )}
    >
      {up ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}
