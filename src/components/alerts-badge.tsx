import { useEffect, useState } from "react";
import { Bell, CheckCircle2, TrendingDown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";

type Alerta = {
  id: number;
  unidade_id: number;
  tipo: "meta" | "avaliacao";
  mensagem: string;
  criado_em: string;
  resolvido: boolean;
};

const TIPO_ICON = {
  meta: TrendingDown,
  avaliacao: Star,
};

const TIPO_LABEL = {
  meta: "Meta",
  avaliacao: "Avaliação",
};

export function AlertsBadge() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  // RLS já limita: gerente só recebe a própria unidade nessa query,
  // gestor recebe todas — então o mesmo hook serve os dois papéis sem
  // distinção aqui.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;

    supabase
      .from("alertas")
      .select("id, unidade_id, tipo, mensagem, criado_em, resolvido")
      .eq("resolvido", false)
      .order("criado_em", { ascending: false })
      .then(({ data }) => {
        if (active) setAlertas(data ?? []);
      });

    const channel = supabase
      .channel("alertas-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas" }, (payload) => {
        const row = payload.new as Alerta;

        if (payload.eventType === "DELETE" || row.resolvido) {
          setAlertas((prev) => prev.filter((a) => a.id !== row.id));
          return;
        }

        setAlertas((prev) => {
          const withoutRow = prev.filter((a) => a.id !== row.id);
          return [row, ...withoutRow].sort(
            (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
          );
        });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const naoResolvidos = alertas.length;

  async function handleResolver(id: number) {
    setAlertas((prev) => prev.filter((a) => a.id !== id));
    await supabase.from("alertas").update({ resolvido: true }).eq("id", id);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative size-9">
          <Bell className="size-4" />
          {naoResolvidos > 0 && (
            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              {naoResolvidos > 9 ? "9+" : naoResolvidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold">Alertas</p>
          <p className="text-[11px] text-muted-foreground">
            {naoResolvidos > 0 ? `${naoResolvidos} não resolvido(s)` : "Nenhum alerta pendente"}
          </p>
        </div>
        <div className="max-h-80 overflow-auto">
          {alertas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <CheckCircle2 className="size-6 text-success" />
              <p className="text-xs text-muted-foreground">Tudo em dia por aqui.</p>
            </div>
          ) : (
            <>
              {alertas.map((alerta) => {
                const Icon = TIPO_ICON[alerta.tipo];
                return (
                  <div key={alerta.id} className="border-b border-border p-3 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                            {TIPO_LABEL[alerta.tipo]}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(alerta.criado_em).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs">{alerta.mensagem}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1.5 h-6 px-2 text-[11px]"
                          onClick={() => handleResolver(alerta.id)}
                        >
                          Marcar como resolvido
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
