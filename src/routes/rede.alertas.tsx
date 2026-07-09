import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Star, TrendingDown } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export const Route = createFileRoute("/rede/alertas")({
  head: () => ({
    meta: [{ title: "Alertas — Sabor & Cia" }],
  }),
  component: AlertasPage,
});

function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);

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
      .channel("alertas-page")
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

  async function handleResolver(id: number) {
    setAlertas((prev) => prev.filter((a) => a.id !== id));
    await supabase.from("alertas").update({ resolvido: true }).eq("id", id);
  }

  return (
    <>
      <TopBar
        title="Alertas"
        subtitle={alertas.length > 0 ? `${alertas.length} não resolvido(s)` : "Tudo em dia"}
      />
      <div className="mx-auto max-w-2xl space-y-3 p-4 sm:p-6 lg:p-8">
        {alertas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <p className="text-sm text-muted-foreground">Nenhum alerta pendente na rede.</p>
          </div>
        ) : (
          alertas.map((alerta) => {
            const Icon = TIPO_ICON[alerta.tipo];
            return (
              <Card key={alerta.id}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        {TIPO_LABEL[alerta.tipo]}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(alerta.criado_em).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm">{alerta.mensagem}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 px-2 text-xs"
                      onClick={() => handleResolver(alerta.id)}
                    >
                      Marcar como resolvido
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
