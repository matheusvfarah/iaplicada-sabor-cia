import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PERIODS, parseDateOnly, toDateParam, type PeriodId, type CustomRange } from "@/lib/period";

export function PeriodFilter({
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
}: {
  period: PeriodId;
  onPeriodChange: (period: PeriodId) => void;
  customRange: CustomRange;
  onCustomRangeChange: (range: CustomRange) => void;
}) {
  const active = period === "custom";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={active ? undefined : period}
        onValueChange={(v) => onPeriodChange(v as PeriodId)}
      >
        <TabsList>
          {PERIODS.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="h-6 w-px bg-border" />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant={active ? "default" : "outline"} size="sm" className="gap-1.5">
            <CalendarIcon className="size-3.5" />
            Início:{" "}
            {parseDateOnly(customRange.inicio).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={parseDateOnly(customRange.inicio)}
            disabled={{ after: new Date(), before: parseDateOnly("2000-01-01") }}
            onSelect={(date) => {
              if (!date) return;
              const inicio = toDateParam(date);
              onCustomRangeChange({
                inicio,
                fim: inicio > customRange.fim ? inicio : customRange.fim,
              });
              onPeriodChange("custom");
            }}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant={active ? "default" : "outline"} size="sm" className="gap-1.5">
            <CalendarIcon className="size-3.5" />
            Fim:{" "}
            {parseDateOnly(customRange.fim).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={parseDateOnly(customRange.fim)}
            disabled={{ after: new Date(), before: parseDateOnly(customRange.inicio) }}
            onSelect={(date) => {
              if (!date) return;
              onCustomRangeChange({ ...customRange, fim: toDateParam(date) });
              onPeriodChange("custom");
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
