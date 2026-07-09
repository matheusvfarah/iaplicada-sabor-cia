import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UnitNav } from "@/components/unit-nav";
import { UnitContext } from "@/lib/unit-context";
import { supabase } from "@/lib/supabase";
import { CURRENCY_FULL } from "@/lib/currency";
import {
  minutosParaProximaVirada,
  useMinuteTick,
  type HorarioFuncionamento,
} from "@/lib/unidade-status";

type Plataforma = "ifood" | "rappi" | "proprio";

type Pedido = {
  id: number;
  unidade_id: number;
  valor: number;
  plataforma: Plataforma;
  status: string;
  data_pedido: string;
};

type PedidoItemDetalhe = {
  id: number;
  quantidade: number;
  preco_unitario: number;
  produto: { id: number; nome: string; disponivel: boolean } | null;
};

const PLATFORM_LABEL: Record<Plataforma, string> = {
  ifood: "iFood",
  rappi: "Rappi",
  proprio: "Próprio",
};

export const Route = createFileRoute("/unidade/$unidadeId")({
  // Não consulta o Supabase aqui: esse loader roda no servidor (SSR) em
  // reloads/navegação direta, e o client ali não tem a sessão de auth
  // (ela só existe no localStorage do navegador) — RLS bloquearia
  // qualquer usuário, mesmo logado. A busca real acontece no client.
  loader: ({ params }) => {
    const unidadeId = Number(params.unidadeId);
    if (!Number.isFinite(unidadeId)) throw notFound();
    return { unidadeId };
  },
  notFoundComponent: () => <UnidadeNaoEncontrada />,
  component: UnitLayout,
});

export function UnidadeNaoEncontrada() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div className="max-w-sm">
        <p className="text-xs font-medium text-primary">Unidade não encontrada</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Cozinha não faz parte da rede</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Verifique o link ou volte para o dashboard geral.
        </p>
        <Button asChild className="mt-6">
          <Link to="/rede">Voltar ao Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function UnitLayout() {
  const { unidadeId } = Route.useLoaderData();
  const [unit, setUnit] = useState<{ id: number; nome: string } | null>(null);
  const [horario, setHorario] = useState<HorarioFuncionamento | null>(null);
  const [unitNotFound, setUnitNotFound] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<Pedido[]>([]);
  const [pendingItens, setPendingItens] = useState<PedidoItemDetalhe[]>([]);
  const [resolvingPending, setResolvingPending] = useState(false);

  // Busca a unidade no client (não no loader — ver comentário na rota).
  useEffect(() => {
    let active = true;
    supabase
      .from("unidades")
      .select("id, nome, horario_abertura, horario_fechamento")
      .eq("id", unidadeId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setUnitNotFound(true);
          return;
        }
        setUnit({ id: data.id, nome: data.nome });
        setHorario({
          horario_abertura: data.horario_abertura,
          horario_fechamento: data.horario_fechamento,
        });
      });
    return () => {
      active = false;
    };
  }, [unidadeId]);

  // Aviso 30 min antes de abrir/fechar: banner discreto + toast único
  // quando cruza o limiar (não repete a cada tick de 1 min).
  useMinuteTick();
  const proximaVirada = horario ? minutosParaProximaVirada(horario) : null;
  const showBanner = !!proximaVirada && proximaVirada.minutos <= 30;
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!unit) return;
    if (showBanner && proximaVirada) {
      const key = `${unit.id}-${proximaVirada.tipo}`;
      if (lastNotifiedRef.current !== key) {
        lastNotifiedRef.current = key;
        toast(
          proximaVirada.tipo === "fecha"
            ? `${unit.nome} fecha em ${proximaVirada.minutos} min`
            : `${unit.nome} abre em ${proximaVirada.minutos} min`,
        );
      }
    } else {
      lastNotifiedRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o cruzamento do limiar deve disparar o toast
  }, [showBanner, proximaVirada?.tipo, unit?.id]);

  // Fila de pedidos pendentes (chegada simulada) — global à área da
  // unidade, aparece em qualquer subpágina (Dashboard/Pedidos/Cardápio).
  useEffect(() => {
    if (!unit) return;
    let active = true;

    supabase
      .from("pedidos")
      .select("id, unidade_id, valor, plataforma, status, data_pedido")
      .eq("unidade_id", unit.id)
      .eq("status", "pendente")
      .order("data_pedido", { ascending: true })
      .then(({ data }) => {
        if (active) setPendingQueue(data ?? []);
      });

    const channel = supabase
      .channel(`pedidos-pendentes-${unit.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `unidade_id=eq.${unit.id}` },
        (payload) => {
          const row = payload.new as Pedido;
          if (payload.eventType === "INSERT" && row.status === "pendente") {
            setPendingQueue((prev) => [...prev, row]);
          } else {
            setPendingQueue((prev) => prev.filter((p) => p.id !== row.id));
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [unit]);

  const currentPending = pendingQueue[0] ?? null;

  useEffect(() => {
    if (!currentPending) {
      setPendingItens([]);
      return;
    }
    let active = true;
    supabase
      .from("pedido_itens")
      .select("id, quantidade, preco_unitario, produto:produtos(id, nome, disponivel)")
      .eq("pedido_id", currentPending.id)
      .then(({ data }) => {
        if (active) setPendingItens((data as unknown as PedidoItemDetalhe[]) ?? []);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o id importa, não a identidade do objeto
  }, [currentPending?.id]);

  async function handleResolverPendente(novoStatus: "recebido" | "cancelado") {
    if (!currentPending) return;
    setResolvingPending(true);
    const { error } = await supabase
      .from("pedidos")
      .update({ status: novoStatus })
      .eq("id", currentPending.id);
    setResolvingPending(false);
    if (!error) {
      setPendingQueue((prev) => prev.filter((p) => p.id !== currentPending.id));
    }
  }

  if (unitNotFound) {
    return (
      <AppShell>
        <UnidadeNaoEncontrada />
      </AppShell>
    );
  }

  if (!unit) {
    return (
      <AppShell>
        <div className="grid min-h-screen place-items-center bg-background">
          <p className="text-xs text-muted-foreground">Carregando unidade…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <UnitContext.Provider value={unit}>
        <Dialog open={!!currentPending}>
          <DialogContent
            showCloseButton={false}
            className="sm:max-w-md"
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Novo pedido recebido</DialogTitle>
              <DialogDescription>
                {currentPending && (
                  <>
                    Pedido #{currentPending.id} · {PLATFORM_LABEL[currentPending.plataforma]} ·{" "}
                    {CURRENCY_FULL.format(currentPending.valor)}
                    {pendingQueue.length > 1 && ` · +${pendingQueue.length - 1} na fila`}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-64 space-y-2 overflow-auto">
              {pendingItens.length === 0 ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                pendingItens.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {item.quantidade}× {item.produto?.nome ?? "Item"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {CURRENCY_FULL.format(item.preco_unitario)} cada
                      </p>
                    </div>
                    {item.produto && !item.produto.disponivel && (
                      <Badge
                        variant="outline"
                        className="ml-2 shrink-0 gap-1 border-destructive/20 bg-destructive/10 text-[10px] text-destructive"
                      >
                        <AlertTriangle className="size-3" />
                        Indisponível agora
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={resolvingPending}
                onClick={() => handleResolverPendente("cancelado")}
              >
                Recusar
              </Button>
              <Button
                className="flex-1"
                disabled={resolvingPending}
                onClick={() => handleResolverPendente("recebido")}
              >
                Aceitar pedido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {showBanner && proximaVirada && (
          <div className="flex items-center justify-center gap-1.5 border-b border-border bg-accent-tint px-4 py-1.5 text-center text-xs font-medium text-accent-tint-foreground">
            <Clock className="size-3.5 shrink-0" />
            {proximaVirada.tipo === "fecha"
              ? `Fecha em ${proximaVirada.minutos} min`
              : `Abre em ${proximaVirada.minutos} min`}
          </div>
        )}
        <UnitNav unidadeId={unit.id} />
        <div className="pb-16 sm:pb-0">
          <Outlet />
        </div>
      </UnitContext.Provider>
    </AppShell>
  );
}
