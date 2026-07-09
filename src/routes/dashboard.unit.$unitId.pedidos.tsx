import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Clock,
  Download,
  Flame,
  PackageCheck,
  PackageOpen,
  ChefHat,
  ChevronDown,
  FileText,
} from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { exportCSV, exportPDF } from "@/lib/export";
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

// Badges de plataforma seguem o design system: iFood = danger, Rappi = âmbar/marca, Próprio = verde.
const PLATFORM_BADGE: Record<Plataforma, string> = {
  ifood: "bg-danger-tint text-danger-tint-foreground",
  rappi: "bg-accent-tint text-accent-tint-foreground",
  proprio: "bg-success-tint text-success-tint-foreground",
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

function itensResumo(itens: ItemPedido[]) {
  return itens.map((item) => `${item.quantidade}× ${item.produto?.nome ?? "Item"}`).join(" · ");
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

  const handleExportCSV = () => {
    exportCSV(
      `sabor-cia-unidade-${unit.id}-pedidos-hoje`,
      orders.map((o) => ({
        codigo: o.codigo,
        status: o.status,
        plataforma: PLATFORM_LABEL[o.plataforma],
        valor: o.valor,
      })),
    );
  };

  const handleExportPDF = () => {
    exportPDF(
      `sabor-cia-unidade-${unit.id}-pedidos-hoje`,
      `Sabor & Cia — ${unit.nome} — Pedidos de hoje`,
      JSON.stringify(orders, null, 2),
    );
  };

  return (
    <>
      <TopBar
        title="Pedidos"
        subtitle={`${orders.length} pedidos hoje · Tempo médio ${
          tempoMedioHoje != null ? `${tempoMedioHoje.toFixed(0)} min` : "—"
        }`}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={loading} className="gap-1.5">
                  <Download className="size-3.5" />
                  Exportar
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileText className="mr-2 size-3.5" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>
                  <FileText className="mr-2 size-3.5" />
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertsBadge />
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
        {/* Desktop: 3 colunas lado a lado */}
        <div className="hidden gap-4 sm:grid sm:grid-cols-3">
          <KanbanColumn
            title="Recebidos"
            icon={PackageOpen}
            countTint="bg-accent-tint text-accent-tint-foreground"
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
            countTint="bg-primary/10 text-primary"
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
            title="Finalizados"
            icon={PackageCheck}
            countTint="bg-success-tint text-success-tint-foreground"
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

        {/* Mobile: tabs segmentadas por coluna */}
        <Tabs defaultValue="recebido" className="sm:hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="recebido" className="gap-1.5">
              Recebidos
              <Badge variant="outline" className="h-4 min-w-4 justify-center px-1 text-[10px]">
                {columns.recebido.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="preparando" className="gap-1.5">
              Produção
              <Badge variant="outline" className="h-4 min-w-4 justify-center px-1 text-[10px]">
                {columns.preparando.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="entregue" className="gap-1.5">
              Prontos
              <Badge variant="outline" className="h-4 min-w-4 justify-center px-1 text-[10px]">
                {columns.entregue.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recebido">
            <KanbanColumn
              title="Recebidos"
              icon={PackageOpen}
              countTint="bg-accent-tint text-accent-tint-foreground"
              count={columns.recebido.length}
              loading={loading}
              emptyTitle="Nenhum pedido novo"
              emptyHint="Pedidos aceitos aparecem aqui assim que chegarem."
              hideHeader
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
          </TabsContent>

          <TabsContent value="preparando">
            <KanbanColumn
              title="Em produção"
              icon={ChefHat}
              countTint="bg-primary/10 text-primary"
              count={columns.preparando.length}
              loading={loading}
              emptyTitle="Nada em produção"
              emptyHint="Aceite um pedido recebido para começar o preparo."
              hideHeader
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
          </TabsContent>

          <TabsContent value="entregue">
            <KanbanColumn
              title="Finalizados"
              icon={PackageCheck}
              countTint="bg-success-tint text-success-tint-foreground"
              count={columns.entregue.length}
              loading={loading}
              emptyTitle="Nenhum pedido finalizado ainda"
              emptyHint="Pedidos entregues hoje aparecem aqui."
              hideHeader
            >
              {columns.entregue.map((pedido) => (
                <PedidoCard key={pedido.id} pedido={pedido} finalizado />
              ))}
            </KanbanColumn>
          </TabsContent>
        </Tabs>
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
  countTint,
  count,
  loading,
  emptyTitle,
  emptyHint,
  hideHeader,
  children,
}: {
  title: string;
  icon: typeof PackageOpen;
  countTint: string;
  count: number;
  loading: boolean;
  emptyTitle: string;
  emptyHint: string;
  hideHeader?: boolean;
  children: React.ReactNode;
}) {
  const isEmpty = !loading && count === 0;
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-[#F3EDE1] p-3 dark:bg-secondary">
      {!hideHeader && (
        <div className="mb-3 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <Icon className="size-3.5 text-muted-foreground" />
            <h2 className="text-[13px] font-medium">{title}</h2>
          </div>
          <span
            className={cn(
              "grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-mono text-[10px] font-semibold",
              countTint,
            )}
          >
            {count}
          </span>
        </div>
      )}
      <div className="flex-1 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[10px] bg-surface" />
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
  const resumo = itensResumo(pedido.itens);

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-top-2 rounded-[10px] border border-border bg-surface p-3 duration-300",
        finalizado && "opacity-75",
      )}
    >
      {/* linha 1: código + badge plataforma + valor */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="shrink-0 font-mono text-sm font-bold">{pedido.codigo ?? `#${pedido.id}`}</p>
          <Badge className={cn("shrink-0 border-none text-[10px]", PLATFORM_BADGE[pedido.plataforma])}>
            {PLATFORM_LABEL[pedido.plataforma]}
          </Badge>
        </div>
        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">
          {CURRENCY_FULL.format(pedido.valor)}
        </p>
      </div>

      {/* linha 2: itens resumidos */}
      {resumo && <p className="mt-1.5 truncate text-[12px] text-muted-foreground">{resumo}</p>}

      {/* linha 3: cronômetro + ações */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {elapsed != null ? (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium",
              urgente
                ? "bg-danger-tint text-danger-tint-foreground"
                : "bg-accent-tint text-accent-tint-foreground",
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

        {(onAceitar || onFinalizar) && (
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-danger-tint-foreground hover:bg-danger-tint hover:text-danger-tint-foreground"
              onClick={onRecusar ?? onCancelar}
            >
              {onRecusar ? "Recusar" : "Cancelar"}
            </Button>
            {onAceitar ? (
              <Button
                size="sm"
                className="h-7 bg-success px-3 text-success-foreground hover:bg-success/90"
                onClick={onAceitar}
              >
                Aceitar
              </Button>
            ) : (
              <Button size="sm" className="h-7 px-3" onClick={onFinalizar}>
                Finalizar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
