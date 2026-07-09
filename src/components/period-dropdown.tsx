import { useState } from "react";
import { Calendar as CalendarIcon, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PERIODS, periodLabel, toDateParam, type PeriodId, type CustomRange } from "@/lib/period";

function buttonLabel(period: PeriodId, customRange: CustomRange) {
  if (period === "custom") return periodLabel(period, customRange);
  if (period === "today") return "Hoje";
  return `Últimos ${periodLabel(period, customRange).toLowerCase()}`;
}

// Substitui a fileira de pills + botões de data por um único botão
// "Período ▾", no mesmo padrão visual do "Exportar ▾".
export function PeriodDropdown({
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
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "custom">("list");
  const [draftInicio, setDraftInicio] = useState(customRange.inicio);
  const [draftFim, setDraftFim] = useState(customRange.fim);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setView("list");
  }

  function handleAplicar() {
    if (!draftInicio || !draftFim) return;
    onCustomRangeChange({ inicio: draftInicio, fim: draftFim });
    onPeriodChange("custom");
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <CalendarIcon className="size-3.5" />
          {buttonLabel(period, customRange)}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {view === "list" ? (
          <>
            {PERIODS.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => {
                  onPeriodChange(p.id);
                  setOpen(false);
                }}
                className="justify-between"
              >
                {p.label}
                {period === p.id && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setDraftInicio(customRange.inicio);
                setDraftFim(customRange.fim);
                setView("custom");
              }}
              className="justify-between"
            >
              Personalizado…
              {period === "custom" && <Check className="size-3.5" />}
            </DropdownMenuItem>
          </>
        ) : (
          <div className="space-y-3 p-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Início</Label>
              <Input
                type="date"
                value={draftInicio}
                max={draftFim || toDateParam(new Date())}
                onChange={(e) => setDraftInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fim</Label>
              <Input
                type="date"
                value={draftFim}
                min={draftInicio}
                max={toDateParam(new Date())}
                onChange={(e) => setDraftFim(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setView("list")}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!draftInicio || !draftFim}
                onClick={handleAplicar}
              >
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
