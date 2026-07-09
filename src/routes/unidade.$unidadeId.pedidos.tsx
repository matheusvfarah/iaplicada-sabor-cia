import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
import { exportCsv, exportPdf, type ExportDataset } from "@/lib/export";
import { useUnit } from "@/lib/unit-context";
import { useUnidades } from "@/lib/use-unidades";
import { cn } from "@/lib/utils";
import { playNotificationSound } from "@/lib/notification-sound";

const TEMPO_LIMITE_ACEITE_PADRAO = 5;
const LIMITE_ATRASO_PADRAO = 20;

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

const STATUS_LABEL: Record<StatusKanban, string> = {
  recebido: "Recebido",
  preparando: "Em produção",
  entregue: "Finalizado",
};

// Badges de plataforma seguem o design system: iFood = danger, Rappi = âmbar/marca, Próprio = verde.
const PLATFORM_BADGE: Record<Plataforma, string> = {
  ifood: "bg-danger-tint text-danger-tint-foreground",
  rappi: "bg-accent-tint text-accent-tint-foreground",
  proprio: "bg-success-tint text-success-tint-foreground",
};

// Drag-and-drop só faz transição de status pra frente — cancelamento
// continua exclusivo do botão (com confirmação), nunca por drag.
const PROXIMO_STATUS: Record<StatusKanban, StatusKanban | null> = {
  recebido: "preparando",
  preparando: "entregue",
  entregue: null,
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export const Route = createFileRoute("/unidade/$unidadeId/pedidos")({
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
  const tick = useTick(1000);
  const reducedMotion = usePrefersReducedMotion();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<PedidoKanban[]>([]);
  const [tempoMedioHoje, setTempoMedioHoje] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    pedido: PedidoKanban;
    tipo: "recusar" | "cancelar";
  } | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<StatusKanban | null>(null);

  const { data: unidades } = useUnidades();
  const configUnidade = unidades?.find((u) => u.id === unit.id);
  const tempoLimiteAceite = configUnidade?.tempo_limite_aceite_min ?? TEMPO_LIMITE_ACEITE_PADRAO;
  const limiteAtraso = configUnidade?.limite_atraso_min ?? LIMITE_ATRASO_PADRAO;
  const recusandoAutoRef = useRef<Set<number>>(new Set());
  const atrasoAlertadoRef = useRef<Set<number>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

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

  // Recusa automática: pedido "recebido" sem ação além do tempo limite
  // configurado vira recusado sozinho, sem confirmação (é automático).
  useEffect(() => {
    for (const pedido of columns.recebido) {
      if (recusandoAutoRef.current.has(pedido.id)) continue;
      if (elapsedMinutes(pedido.data_pedido) < tempoLimiteAceite) continue;
      recusandoAutoRef.current.add(pedido.id);
      updateStatus(pedido, "cancelado");
      toast.warning(`Pedido ${pedido.codigo ?? `#${pedido.id}`} recusado automaticamente`, {
        description: `Passou de ${tempoLimiteAceite} min sem ser aceito.`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reavalia a cada tick de 1s (useTick) pra pegar o tempo decorrido, não só quando a coluna muda
  }, [columns.recebido, tempoLimiteAceite, tick]);

  // Alerta de atraso: pedido "em produção" que passou da meta de tempo
  // de preparo configurada avisa uma vez (não repete a cada tick).
  useEffect(() => {
    const emProducaoIds = new Set(columns.preparando.map((p) => p.id));
    for (const id of atrasoAlertadoRef.current) {
      if (!emProducaoIds.has(id)) atrasoAlertadoRef.current.delete(id);
    }
    for (const pedido of columns.preparando) {
      if (atrasoAlertadoRef.current.has(pedido.id)) continue;
      if (!pedido.preparando_em) continue;
      if (elapsedMinutes(pedido.preparando_em) < limiteAtraso) continue;
      atrasoAlertadoRef.current.add(pedido.id);
      toast.warning(`Pedido ${pedido.codigo ?? `#${pedido.id}`} atrasado`, {
        description: `Preparo passou do limite de atraso de ${limiteAtraso} min.`,
      });
    }
  }, [columns.preparando, limiteAtraso, tick]);

  function handleConfirm() {
    if (!confirmAction) return;
    updateStatus(confirmAction.pedido, "cancelado");
    setConfirmAction(null);
  }

  const activeCard = activeId != null ? orders.find((o) => o.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverColumn((event.over?.id as StatusKanban | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverColumn(null);
    const { active, over } = event;
    if (!over) return;

    const pedido = orders.find((o) => o.id === Number(active.id));
    if (!pedido) return;

    const destino = over.id as StatusKanban;
    // Só aceita a transição válida pra frente — qualquer outro alvo
    // (incluindo soltar na própria coluna) não faz nada: o card volta
    // sozinho pra posição de origem (dnd-kit desfaz o transform).
    if (PROXIMO_STATUS[pedido.status] !== destino) return;

    updateStatus(pedido, destino);
  }

  const buildExportDataset = (): ExportDataset => ({
    page: `unidade-${unit.id}-pedidos`,
    title: `${unit.nome} — Pedidos`,
    period: "Hoje",
    sections: [
      {
        columns: [
          { header: "Código", value: (r: PedidoKanban) => r.codigo ?? `#${r.id}` },
          { header: "Plataforma", value: (r: PedidoKanban) => PLATFORM_LABEL[r.plataforma] },
          { header: "Status", value: (r: PedidoKanban) => STATUS_LABEL[r.status] },
          { header: "Itens", value: (r: PedidoKanban) => itensResumo(r.itens) },
          { header: "Valor", value: (r: PedidoKanban) => CURRENCY_FULL.format(r.valor) },
          {
            header: "Recebido às",
            value: (r: PedidoKanban) =>
              new Date(r.data_pedido).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              }),
          },
          {
            header: "Em produção às",
            value: (r: PedidoKanban) =>
              r.preparando_em
                ? new Date(r.preparando_em).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
          },
          {
            header: "Finalizado às",
            value: (r: PedidoKanban) =>
              r.entregue_em
                ? new Date(r.entregue_em).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
          },
        ],
        rows: orders,
      },
    ],
  });

  const handleExportCSV = () => exportCsv(buildExportDataset());
  const handleExportPDF = () => exportPdf(buildExportDataset());

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
        {/* Desktop: 3 colunas lado a lado, com drag-and-drop entre elas */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="hidden gap-4 sm:grid sm:grid-cols-3">
            <KanbanColumn
              id="recebido"
              title="Recebidos"
              icon={PackageOpen}
              countTint="bg-accent-tint text-accent-tint-foreground"
              count={columns.recebido.length}
              loading={loading}
              emptyTitle="Nenhum pedido novo"
              emptyHint="Pedidos aceitos aparecem aqui assim que chegarem."
              highlight={
                overColumn === "recebido" &&
                PROXIMO_STATUS[activeCard?.status ?? "entregue"] === "recebido"
              }
            >
              {columns.recebido.map((pedido) => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  draggable
                  reducedMotion={reducedMotion}
                  tempoLimiteAceite={tempoLimiteAceite}
                  onAceitar={() => updateStatus(pedido, "preparando")}
                  onRecusar={() => setConfirmAction({ pedido, tipo: "recusar" })}
                />
              ))}
            </KanbanColumn>

            <KanbanColumn
              id="preparando"
              title="Em produção"
              icon={ChefHat}
              countTint="bg-primary/10 text-primary"
              count={columns.preparando.length}
              loading={loading}
              emptyTitle="Nada em produção"
              emptyHint="Aceite um pedido recebido para começar o preparo."
              highlight={
                overColumn === "preparando" &&
                PROXIMO_STATUS[activeCard?.status ?? "entregue"] === "preparando"
              }
            >
              {columns.preparando.map((pedido) => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  draggable
                  reducedMotion={reducedMotion}
                  limiteAtraso={limiteAtraso}
                  onFinalizar={() => updateStatus(pedido, "entregue")}
                  onCancelar={() => setConfirmAction({ pedido, tipo: "cancelar" })}
                />
              ))}
            </KanbanColumn>

            <KanbanColumn
              id="entregue"
              title="Finalizados"
              icon={PackageCheck}
              countTint="bg-success-tint text-success-tint-foreground"
              count={columns.entregue.length}
              loading={loading}
              emptyTitle="Nenhum pedido finalizado ainda"
              emptyHint="Pedidos entregues hoje aparecem aqui."
              highlight={false}
            >
              {columns.entregue.map((pedido) => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  finalizado
                  reducedMotion={reducedMotion}
                />
              ))}
            </KanbanColumn>
          </div>

          <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
            {activeCard && (
              <div className={reducedMotion ? "" : "rotate-2"}>
                <PedidoCard pedido={activeCard} overlay reducedMotion={reducedMotion} />
              </div>
            )}
          </DragOverlay>
        </DndContext>

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
                  tempoLimiteAceite={tempoLimiteAceite}
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
                  limiteAtraso={limiteAtraso}
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
  id,
  title,
  icon: Icon,
  countTint,
  count,
  loading,
  emptyTitle,
  emptyHint,
  hideHeader,
  highlight,
  children,
}: {
  id?: StatusKanban;
  title: string;
  icon: typeof PackageOpen;
  countTint: string;
  count: number;
  loading: boolean;
  emptyTitle: string;
  emptyHint: string;
  hideHeader?: boolean;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  const isEmpty = !loading && count === 0;
  const { setNodeRef, isOver } = useDroppable({ id: id ?? title, disabled: !id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-0 flex-col rounded-xl bg-[#F3EDE1] p-3 transition-colors dark:bg-secondary",
        highlight && "ring-2 ring-primary/50",
        isOver && !highlight && id && "cursor-not-allowed opacity-70",
      )}
    >
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
  draggable,
  overlay,
  reducedMotion,
  tempoLimiteAceite = TEMPO_LIMITE_ACEITE_PADRAO,
  limiteAtraso = LIMITE_ATRASO_PADRAO,
  onAceitar,
  onRecusar,
  onFinalizar,
  onCancelar,
}: {
  pedido: PedidoKanban;
  finalizado?: boolean;
  draggable?: boolean;
  overlay?: boolean;
  reducedMotion?: boolean;
  tempoLimiteAceite?: number;
  limiteAtraso?: number;
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

  const urgente =
    (isRecebido && (elapsed ?? 0) > tempoLimiteAceite) ||
    (isPreparando && (elapsed ?? 0) > limiteAtraso);
  const resumo = itensResumo(pedido.itens);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pedido.id,
    disabled: !draggable,
  });

  const style =
    draggable && transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={draggable ? setNodeRef : undefined}
      style={style}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={cn(
        "rounded-[10px] border border-border bg-surface p-3 transition-[box-shadow,border-color,background-color]",
        !reducedMotion && "animate-in fade-in slide-in-from-top-2 duration-300",
        finalizado && "opacity-75",
        draggable && "touch-none",
        isDragging && "opacity-40",
        !overlay &&
          !isDragging &&
          "hover:border-border-strong hover:bg-surface-hover hover:shadow-sm",
        overlay && !reducedMotion && "cursor-grabbing shadow-xl",
      )}
    >
      {/* linha 1: código + badge plataforma + valor */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="shrink-0 font-mono text-sm font-bold">{pedido.codigo ?? `#${pedido.id}`}</p>
          <Badge
            className={cn("shrink-0 border-none text-[10px]", PLATFORM_BADGE[pedido.plataforma])}
          >
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
