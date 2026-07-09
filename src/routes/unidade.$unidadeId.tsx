import { createFileRoute, Link, notFound, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { CURRENCY_FULL } from "@/lib/currency";
import { useHorarioAlertas } from "@/lib/use-horario-alertas";
import { useUnidades } from "@/lib/use-unidades";

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

function SemUnidadeVinculada() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div className="max-w-sm">
        <p className="text-xs font-medium text-destructive">Conta sem unidade</p>
        <h2 className="mt-2 font-display text-2xl font-bold">
          Sua conta não está vinculada a nenhuma unidade
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Contate o administrador da rede para vincular seu usuário a uma unidade.
        </p>
      </div>
    </div>
  );
}

function UnitLayout() {
  const { unidadeId } = Route.useLoaderData();
  const { session, ready } = useSession();
  const navigate = useNavigate();
  const { data: unidades, isLoading: unidadesLoading } = useUnidades();
  const unidade = unidades?.find((u) => u.id === unidadeId) ?? null;
  const unit = unidade ? { id: unidade.id, nome: unidade.nome } : null;
  const unitNotFound = !unidadesLoading && !!unidades && !unidade;
  const [pendingQueue, setPendingQueue] = useState<Pedido[]>([]);
  const [pendingItens, setPendingItens] = useState<PedidoItemDetalhe[]>([]);
  const [resolvingPending, setResolvingPending] = useState(false);

  // Gerente só acessa a própria unidade — deep link pra outra unidade
  // redireciona de volta com aviso, em vez de deixar o botão/URL "morto"
  // ou vazar dados de outra unidade (a RLS já bloqueia os dados a nível
  // de linha; isso aqui é só a camada de UX/rota).
  const isGerenteForaDaUnidade =
    !!session &&
    session.profile.role === "gerente" &&
    session.profile.unidade_id != null &&
    session.profile.unidade_id !== unidadeId;

  useEffect(() => {
    if (!isGerenteForaDaUnidade || !session?.profile.unidade_id) return;
    toast.error("Você não tem acesso a essa unidade");
    navigate({
      to: "/unidade/$unidadeId",
      params: { unidadeId: String(session.profile.unidade_id) },
      replace: true,
    });
  }, [isGerenteForaDaUnidade, session, navigate]);

  // Aviso 30 min antes de abrir/fechar: banner discreto + toast único
  // por dia (hook único, ver item 1 — dedupe persistido em localStorage).
  // `unidade` vem do cache compartilhado (useUnidades/TanStack Query) —
  // depois de salvar o horário em Configurações, invalidar esse cache
  // já propaga aqui, sem precisar de um fetch próprio que nunca se
  // atualizava sozinho.
  const unidadesParaAlerta = useMemo(() => (unidade ? [unidade] : []), [unidade]);
  const { alertas: horarioAlertas } = useHorarioAlertas(unidadesParaAlerta, true);
  const proximaVirada = horarioAlertas[0] ?? null;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o id importa; `unit` é um objeto novo a cada render (derivado do cache de unidades)
  }, [unit?.id]);

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

  if (ready && session?.profile.role === "gerente" && session.profile.unidade_id == null) {
    return (
      <AppShell>
        <SemUnidadeVinculada />
      </AppShell>
    );
  }

  if (isGerenteForaDaUnidade) {
    return (
      <AppShell>
        <div className="grid min-h-screen place-items-center bg-background">
          <p className="text-xs text-muted-foreground">Redirecionando…</p>
        </div>
      </AppShell>
    );
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

        {proximaVirada && (
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
