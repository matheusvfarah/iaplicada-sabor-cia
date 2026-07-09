import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Flame, PackageCheck, PackageOpen, ChefHat } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { CURRENCY_FULL } from "@/lib/currency";
import { useUnit } from "@/lib/unit-context";
import { cn } from "@/lib/utils";
import { playNotificationSound } from "@/lib/notification-sound";

type Plataforma = "ifood" | "rappi" | "proprio";
type StatusKanban = "recebido" | "preparando" | "entregue";

type ItemPedido = {
  quantidade: number;
  produto: { nome: string } | null;
};

type PedidoKanban = {
  id: number;
  codigo: string | null;
  valor: number;
  plataforma: Plataforma;
  status: StatusKanban;
  data_pedido: string;
  preparando_em: string | null;
  entregue_em: string | null;
  itens: ItemPedido[];
};

const PLATFORM_LABEL: Record<Plataforma, string> = {
  ifood: "iFood",
  rappi: "Rappi",
  proprio: "Próprio",
};

const platformDot: Record<Plataforma, string> = {
  ifood: "bg-red-500",
  rappi: "bg-orange-400",
  proprio: "bg-primary",
};

export const Route = createFileRoute("/dashboard/unit/$unitId/pedidos")({
  head: () => ({
    meta: [{ title: "Pedidos — Sabor & Cia" }],
  }),
  component: PedidosKanban,
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function useTick(intervalMs: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return tick;
}

function elapsedMinutes(since: string) {
  return (Date.now() - new Date(since).getTime()) / 60000;
}

function formatElapsed(min: number) {
  const totalSeconds = Math.max(0, Math.round(min * 60));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PedidosKanban() {
  const unit = useUnit();
  useTick(1000);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<PedidoKanban[]>([]);
  const [tempoMedioHoje, setTempoMedioHoje] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    pedido: PedidoKanban;
    tipo: "recusar" | "cancelar";
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // Kanban é um painel operacional do dia — as 3 colunas ficam
    // restritas a pedidos de hoje, senão pedidos antigos do seed
    // histórico (ou de dias anteriores) ficam acumulados pra sempre
    // como se fossem chegada nova.
    supabase
      .from("pedidos")
      .select(
        "id, codigo, valor, plataforma, status, data_pedido, preparando_em, entregue_em, itens:pedido_itens(quantidade, produto:produtos(nome))",
      )
      .eq("unidade_id", unit.id)
      .in("status", ["recebido", "preparando", "entregue"])
      .gte("data_pedido", startOfToday())
      .order("data_pedido", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setOrders((data as unknown as PedidoKanban[]) ?? []);
        setLoading(false);
      });

    const fetchTempoMedio = () => {
      const hoje = startOfToday().slice(0, 10);
      supabase
        .rpc("rpc_tempo_medio_preparo", { p_unidade: unit.id, p_inicio: hoje, p_fim: hoje })
        .then(({ data }) => {
          if (active) setTempoMedioHoje(data ?? null);
        });
    };
    fetchTempoMedio();

    async function fetchItensFor(pedidoId: number) {
      const { data } = await supabase
        .from("pedido_itens")
        .select("quantidade, produto:produtos(nome)")
        .eq("pedido_id", pedidoId);
      if (!active) return;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === pedidoId ? { ...o, itens: (data as unknown as ItemPedido[]) ?? [] } : o,
        ),
      );
    }

    const channel = supabase
      .channel(`pedidos-kanban-${unit.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `unidade_id=eq.${unit.id}` },
        (payload) => {
          const row = payload.new as Omit<PedidoKanban, "itens" | "status"> & { status: string };

          if (row.status === "entregue") fetchTempoMedio();

          if (row.status === "cancelado" || row.status === "pendente") {
            setOrders((prev) => prev.filter((o) => o.id !== row.id));
            return;
          }

          setOrders((prev) => {
            const idx = prev.findIndex((o) => o.id === row.id);
            if (idx === -1) {
              if (row.status === "recebido") playNotificationSound();
              fetchItensFor(row.id);
              return [...prev, { ...row, itens: [] } as PedidoKanban];
            }
            return prev.map((o, i) => (i === idx ? ({ ...o, ...row } as PedidoKanban) : o));
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [unit.id]);

  const columns = useMemo(
    () => ({
      recebido: orders.filter((o) => o.status === "recebido"),
      preparando: orders.filter((o) => o.status === "preparando"),
      entregue: orders.filter((o) => o.status === "entregue"),
    }),
    [orders],
  );

  async function updateStatus(pedido: PedidoKanban, novoStatus: StatusKanban | "cancelado") {
    const anterior = orders;

    if (novoStatus === "cancelado") {
      setOrders((prev) => prev.filter((o) => o.id !== pedido.id));
    } else {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === pedido.id
            ? {
                ...o,
                status: novoStatus,
                preparando_em:
                  novoStatus === "preparando" ? new Date().toISOString() : o.preparando_em,
                entregue_em: novoStatus === "entregue" ? new Date().toISOString() : o.entregue_em,
              }
            : o,
        ),
      );
    }

    const { error } = await supabase
      .from("pedidos")
      .update({ status: novoStatus })
      .eq("id", pedido.id);
    if (error) {
      setOrders(anterior);
      toast.error("Não foi possível atualizar o pedido.", { description: error.message });
    }
  }

  function handleConfirm() {
    if (!confirmAction) return;
    updateStatus(confirmAction.pedido, "cancelado");
    setConfirmAction(null);
  }

  return (
    <>
      <TopBar
        title="Pedidos"
        subtitle="Fila de produção em tempo real"
        actions={
          <>
            <div className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 sm:flex">
              <Clock className="size-3.5 text-primary" />
              <span className="font-mono text-xs text-muted-foreground">
                Tempo médio hoje:{" "}
                {tempoMedioHoje != null ? `${tempoMedioHoje.toFixed(0)} min` : "—"}
              </span>
            </div>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <AlertsBadge />
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <KanbanColumn
            title="Recebidos"
            icon={PackageOpen}
            count={columns.recebido.length}
            loading={loading}
            emptyTitle="Nenhum pedido novo"
            emptyHint="Pedidos aceitos aparecem aqui assim que chegarem."
          >
            {columns.recebido.map((pedido) => (
              <PedidoCard
                key={pedido.id}
                pedido={pedido}
                onAceitar={() => updateStatus(pedido, "preparando")}
                onRecusar={() => setConfirmAction({ pedido, tipo: "recusar" })}
              />
            ))}
          </KanbanColumn>

          <KanbanColumn
            title="Em produção"
            icon={ChefHat}
            count={columns.preparando.length}
            loading={loading}
            emptyTitle="Nada em produção"
            emptyHint="Aceite um pedido recebido para começar o preparo."
          >
            {columns.preparando.map((pedido) => (
              <PedidoCard
                key={pedido.id}
                pedido={pedido}
                onFinalizar={() => updateStatus(pedido, "entregue")}
                onCancelar={() => setConfirmAction({ pedido, tipo: "cancelar" })}
              />
            ))}
          </KanbanColumn>

          <KanbanColumn
            title="Finalizados (hoje)"
            icon={PackageCheck}
            count={columns.entregue.length}
            loading={loading}
            emptyTitle="Nenhum pedido finalizado ainda"
            emptyHint="Pedidos entregues hoje aparecem aqui."
          >
            {columns.entregue.map((pedido) => (
              <PedidoCard key={pedido.id} pedido={pedido} finalizado />
            ))}
          </KanbanColumn>
        </div>
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.tipo === "recusar" ? "Recusar este pedido?" : "Cancelar este pedido?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Pedido {confirmAction?.pedido.codigo} ·{" "}
              {CURRENCY_FULL.format(confirmAction?.pedido.valor ?? 0)}. Essa ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function KanbanColumn({
  title,
  icon: Icon,
  count,
  loading,
  emptyTitle,
  emptyHint,
  children,
}: {
  title: string;
  icon: typeof PackageOpen;
  count: number;
  loading: boolean;
  emptyTitle: string;
  emptyHint: string;
  children: React.ReactNode;
}) {
  const isEmpty = !loading && count === 0;
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">{title}</h2>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {count}
        </Badge>
      </div>
      <div className="flex-1 space-y-3 p-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="grid place-items-center px-4 py-12 text-center">
            <Icon className="mb-3 size-6 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">{emptyTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{emptyHint}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function PedidoCard({
  pedido,
  finalizado,
  onAceitar,
  onRecusar,
  onFinalizar,
  onCancelar,
}: {
  pedido: PedidoKanban;
  finalizado?: boolean;
  onAceitar?: () => void;
  onRecusar?: () => void;
  onFinalizar?: () => void;
  onCancelar?: () => void;
}) {
  const isRecebido = pedido.status === "recebido";
  const isPreparando = pedido.status === "preparando";

  const elapsed = isRecebido
    ? elapsedMinutes(pedido.data_pedido)
    : isPreparando && pedido.preparando_em
      ? elapsedMinutes(pedido.preparando_em)
      : null;

  const urgente = (isRecebido && (elapsed ?? 0) > 5) || (isPreparando && (elapsed ?? 0) > 20);

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-top-2 rounded-lg border p-3 duration-300",
        urgente
          ? "border-destructive/40 bg-destructive/5"
          : finalizado
            ? "border-border bg-surface/60 opacity-80"
            : "border-border bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold">{pedido.codigo ?? `#${pedido.id}`}</p>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", platformDot[pedido.plataforma])} />
            {PLATFORM_LABEL[pedido.plataforma]}
          </span>
        </div>
        <p className="shrink-0 font-mono text-sm font-semibold">
          {CURRENCY_FULL.format(pedido.valor)}
        </p>
      </div>

      {pedido.itens.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          {pedido.itens.map((item, i) => (
            <li key={i} className="truncate">
              {item.quantidade}× {item.produto?.nome ?? "Item"}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between">
        {elapsed != null ? (
          <span
            className={cn(
              "flex items-center gap-1 font-mono text-xs",
              urgente ? "font-bold text-destructive" : "text-muted-foreground",
            )}
          >
            <Clock className="size-3" />
            {formatElapsed(elapsed)}
            {urgente && <Flame className="size-3" />}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Entregue às{" "}
            {pedido.entregue_em &&
              new Date(pedido.entregue_em).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
          </span>
        )}
      </div>

      {(onAceitar || onFinalizar) && (
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onRecusar ?? onCancelar}>
            {onRecusar ? "Recusar" : "Cancelar"}
          </Button>
          <Button size="sm" className="flex-1" onClick={onAceitar ?? onFinalizar}>
            {onAceitar ? "Aceitar pedido" : "Finalizar"}
          </Button>
        </div>
      )}
    </div>
  );
}
