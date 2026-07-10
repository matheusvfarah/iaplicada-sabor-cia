import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, MapPin, Calendar, CircleDot, Clock, Timer, Target } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { NotificationsBell } from "@/components/notifications-bell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { signOut, useSession } from "@/lib/auth";
import { useUnit } from "@/lib/unit-context";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { CURRENCY_FULL } from "@/lib/currency";
import { cn } from "@/lib/utils";

type UnidadeDetalhe = {
  nome: string;
  endereco: string;
  status: "ativa" | "inativa";
  data_abertura: string;
  horario_abertura: string;
  horario_fechamento: string;
  tempo_limite_aceite_min: number;
  limite_atraso_min: number;
};

export const Route = createFileRoute("/unidade/$unidadeId/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Sabor & Cia" }] }),
  component: ConfiguracoesPage,
});

type MetaMes = {
  mesReferencia: string; // "YYYY-MM-01"
  metaReceita: string; // dígitos crus do input mascarado (centavos)
  metaPedidos: string;
};

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// offset em meses a partir do mês corrente (0 = este mês, -1 = mês
// passado, 1 = mês que vem) — sempre dia 1, formato que o Postgres
// aceita direto pra comparar com mes_referencia.
function mesReferenciaOffset(offset: number) {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function mesLabel(mesReferenciaIso: string) {
  const [ano, mes] = mesReferenciaIso.split("-").map(Number);
  return `${MESES_PT[mes - 1]} de ${ano}`;
}

function centavosParaReais(centavos: string) {
  return (Number(centavos || "0") / 100).toFixed(2);
}

// Máscara de moeda: guarda só os dígitos (centavos) e formata pra
// exibição — sem depender de libs externas de máscara.
function CurrencyMaskInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (centavos: string) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      inputMode="numeric"
      value={CURRENCY_FULL.format(Number(centavosParaReais(value)))}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      disabled={disabled}
    />
  );
}

function ConfiguracoesPage() {
  const unit = useUnit();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const isGestor = session?.profile.role === "gestor_geral";
  const [detalhe, setDetalhe] = useState<UnidadeDetalhe | null>(null);
  const [tema, setTema] = useState<Theme>("dark");
  const [somPedido, setSomPedido] = useState(true);
  const [somAvisosHorario, setSomAvisosHorario] = useState(true);
  const [horarioAbertura, setHorarioAbertura] = useState("11:00");
  const [horarioFechamento, setHorarioFechamento] = useState("23:00");
  const [salvandoHorario, setSalvandoHorario] = useState(false);
  const [tempoLimiteAceite, setTempoLimiteAceite] = useState("5");
  const [limiteAtraso, setLimiteAtraso] = useState("20");
  const [salvandoConfigPedidos, setSalvandoConfigPedidos] = useState(false);
  const [metasLoading, setMetasLoading] = useState(true);
  const [metasHistorico, setMetasHistorico] = useState<MetaMes[]>([]);
  const [metasEditaveis, setMetasEditaveis] = useState<MetaMes[]>([]);
  const [salvandoMetas, setSalvandoMetas] = useState(false);

  // Gestor: histórico (3 meses passados, read-only) + atual e os 2
  // próximos (editáveis, upsert). Gerente: só o mês atual, read-only —
  // meta é decisão da rede, não da unidade (ver Fase 3 do design).
  const offsetsHistorico = useMemo(() => (isGestor ? [-3, -2, -1] : []), [isGestor]);
  const offsetsEditaveis = useMemo(() => (isGestor ? [0, 1, 2] : [0]), [isGestor]);

  useEffect(() => {
    setTema(getStoredTheme());
    setSomPedido(localStorage.getItem("sabor-cia-som-pedido") !== "false");
    setSomAvisosHorario(localStorage.getItem("sabor-cia-som-avisos-horario") !== "false");

    let active = true;
    supabase
      .from("unidades")
      .select(
        "nome, endereco, status, data_abertura, horario_abertura, horario_fechamento, tempo_limite_aceite_min, limite_atraso_min",
      )
      .eq("id", unit.id)
      .single()
      .then(({ data }) => {
        if (!active || !data) return;
        setDetalhe(data);
        setHorarioAbertura(data.horario_abertura.slice(0, 5));
        setHorarioFechamento(data.horario_fechamento.slice(0, 5));
        setTempoLimiteAceite(String(data.tempo_limite_aceite_min));
        setLimiteAtraso(String(data.limite_atraso_min));
      });
    return () => {
      active = false;
    };
  }, [unit.id]);

  async function handleSalvarHorario() {
    setSalvandoHorario(true);
    const { error } = await supabase
      .from("unidades")
      .update({ horario_abertura: horarioAbertura, horario_fechamento: horarioFechamento })
      .eq("id", unit.id);
    setSalvandoHorario(false);
    if (error) {
      toast.error("Não foi possível salvar o horário");
      return;
    }
    toast.success("Horário de funcionamento atualizado");
    setDetalhe((prev) =>
      prev
        ? { ...prev, horario_abertura: horarioAbertura, horario_fechamento: horarioFechamento }
        : prev,
    );
    queryClient.invalidateQueries({ queryKey: ["unidades"] });
  }

  async function handleSalvarConfigPedidos() {
    const tempoLimite = Number(tempoLimiteAceite);
    const limiteAtrasoMin = Number(limiteAtraso);
    if (!Number.isFinite(tempoLimite) || tempoLimite <= 0) {
      toast.error("Tempo limite pra aceitar precisa ser maior que zero");
      return;
    }
    if (!Number.isFinite(limiteAtrasoMin) || limiteAtrasoMin < 5 || limiteAtrasoMin > 120) {
      toast.error("Limite de atraso precisa estar entre 5 e 120 minutos");
      return;
    }
    setSalvandoConfigPedidos(true);
    const { error } = await supabase
      .from("unidades")
      .update({
        tempo_limite_aceite_min: tempoLimite,
        limite_atraso_min: limiteAtrasoMin,
      })
      .eq("id", unit.id);
    setSalvandoConfigPedidos(false);
    if (error) {
      toast.error("Não foi possível salvar as configurações de pedidos");
      return;
    }
    toast.success("Configurações de pedidos atualizadas");
    setDetalhe((prev) =>
      prev
        ? { ...prev, tempo_limite_aceite_min: tempoLimite, limite_atraso_min: limiteAtrasoMin }
        : prev,
    );
    queryClient.invalidateQueries({ queryKey: ["unidades"] });
  }

  useEffect(() => {
    let active = true;
    setMetasLoading(true);
    const offsets = [...offsetsHistorico, ...offsetsEditaveis];
    const mesInicio = mesReferenciaOffset(offsets[0]);
    const mesFim = mesReferenciaOffset(offsets[offsets.length - 1]);

    supabase
      .from("metas")
      .select("mes_referencia, meta_receita, meta_pedidos")
      .eq("unidade_id", unit.id)
      .gte("mes_referencia", mesInicio)
      .lte("mes_referencia", mesFim)
      .then(({ data }) => {
        if (!active) return;
        const porMes = new Map(
          (data ?? []).map((m) => [
            m.mes_referencia,
            {
              metaReceita: String(Math.round(m.meta_receita * 100)),
              metaPedidos: String(m.meta_pedidos),
            },
          ]),
        );
        const linha = (offset: number): MetaMes => {
          const mesReferencia = mesReferenciaOffset(offset);
          const existente = porMes.get(mesReferencia);
          return {
            mesReferencia,
            metaReceita: existente?.metaReceita ?? "",
            metaPedidos: existente?.metaPedidos ?? "",
          };
        };
        setMetasHistorico(offsetsHistorico.map(linha));
        setMetasEditaveis(offsetsEditaveis.map(linha));
        setMetasLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- offsetsHistorico/offsetsEditaveis são arrays recriados a cada render por useMemo; isGestor (que decide o conteúdo deles) já está no array de deps
  }, [unit.id, isGestor]);

  function atualizarMetaEditavel(
    mesReferencia: string,
    campo: "metaReceita" | "metaPedidos",
    valor: string,
  ) {
    setMetasEditaveis((prev) =>
      prev.map((m) => (m.mesReferencia === mesReferencia ? { ...m, [campo]: valor } : m)),
    );
  }

  async function handleSalvarMetas() {
    const paraSalvar = metasEditaveis.filter((m) => m.metaReceita || m.metaPedidos);
    for (const m of paraSalvar) {
      const receita = Number(centavosParaReais(m.metaReceita));
      const pedidos = Number(m.metaPedidos || "0");
      if (!(receita > 0) || !Number.isInteger(pedidos) || pedidos <= 0) {
        toast.error(
          `Meta de ${mesLabel(m.mesReferencia)} precisa ter receita e pedidos maiores que zero`,
        );
        return;
      }
    }

    setSalvandoMetas(true);
    const { error } = await supabase.from("metas").upsert(
      paraSalvar.map((m) => ({
        unidade_id: unit.id,
        mes_referencia: m.mesReferencia,
        meta_receita: Number(centavosParaReais(m.metaReceita)),
        meta_pedidos: Number(m.metaPedidos),
      })),
      { onConflict: "unidade_id,mes_referencia" },
    );
    setSalvandoMetas(false);
    if (error) {
      toast.error("Não foi possível salvar as metas", { description: error.message });
      return;
    }
    toast.success("Metas atualizadas");
    // Dashboards da unidade e da rede buscam KPIs direto no useEffect
    // deles a cada montagem (não passam por react-query) — não há
    // cache pra invalidar; a próxima visita já vem com o dado novo.
  }

  function handleToggleTema(escuro: boolean) {
    const novoTema: Theme = escuro ? "dark" : "light";
    setTema(novoTema);
    applyTheme(novoTema);
  }

  function handleToggleSom(ligado: boolean) {
    setSomPedido(ligado);
    localStorage.setItem("sabor-cia-som-pedido", String(ligado));
    toast.success(ligado ? "Som de novo pedido ativado" : "Som de novo pedido desativado");
  }

  function handleToggleSomAvisosHorario(ligado: boolean) {
    setSomAvisosHorario(ligado);
    localStorage.setItem("sabor-cia-som-avisos-horario", String(ligado));
    toast.success(
      ligado ? "Som de avisos de horário ativado" : "Som de avisos de horário desativado",
    );
  }

  async function handleSair() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <>
      <TopBar
        title="Configurações"
        subtitle={unit.nome}
        actions={<NotificationsBell unidadeIdAtual={unit.id} />}
      />

      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Dados da unidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!detalhe ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div>
                  <p className="text-[11px] text-muted-foreground">Nome</p>
                  <p className="mt-0.5 text-sm font-semibold">{detalhe.nome}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{detalhe.endereco}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CircleDot
                    className={`size-3.5 ${detalhe.status === "ativa" ? "text-success" : "text-muted-foreground"}`}
                  />
                  <p className="text-sm text-muted-foreground">
                    {detalhe.status === "ativa" ? "Unidade ativa" : "Unidade inativa"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Aberta em{" "}
                    {new Date(detalhe.data_abertura).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Clock className="size-4 text-primary" />
              Horário de funcionamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!detalhe ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Abertura</Label>
                    <Input
                      type="time"
                      value={horarioAbertura}
                      onChange={(e) => setHorarioAbertura(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Fechamento</Label>
                    <Input
                      type="time"
                      value={horarioFechamento}
                      onChange={(e) => setHorarioFechamento(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleSalvarHorario}
                  disabled={salvandoHorario}
                  className="w-full sm:w-auto"
                >
                  Salvar horário
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Timer className="size-4 text-primary" />
              Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!detalhe ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Recusar automaticamente após (min)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={tempoLimiteAceite}
                      onChange={(e) => setTempoLimiteAceite(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Limite de atraso (min)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      value={limiteAtraso}
                      onChange={(e) => setLimiteAtraso(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pedido recebido e não aceito dentro do prazo é recusado sozinho no kanban. Passar
                  do limite de atraso em produção dispara uma notificação (entre 5 e 120 min).
                </p>
                <Button
                  size="sm"
                  onClick={handleSalvarConfigPedidos}
                  disabled={salvandoConfigPedidos}
                  className="w-full sm:w-auto"
                >
                  Salvar configurações de pedidos
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Target className="size-4 text-primary" />
              Metas do mês
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {metasLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : isGestor ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Meta é decisão da rede — edite o mês atual e os próximos. Meses passados ficam
                  como histórico, só leitura.
                </p>
                {metasEditaveis.map((m) => (
                  <div key={m.mesReferencia} className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {mesLabel(m.mesReferencia)} · Receita
                      </Label>
                      <CurrencyMaskInput
                        value={m.metaReceita}
                        onChange={(v) => atualizarMetaEditavel(m.mesReferencia, "metaReceita", v)}
                        disabled={salvandoMetas}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Pedidos</Label>
                      <Input
                        type="number"
                        min={1}
                        value={m.metaPedidos}
                        onChange={(e) =>
                          atualizarMetaEditavel(m.mesReferencia, "metaPedidos", e.target.value)
                        }
                        disabled={salvandoMetas}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  size="sm"
                  onClick={handleSalvarMetas}
                  disabled={salvandoMetas}
                  className="w-full sm:w-auto"
                >
                  Salvar metas
                </Button>

                {metasHistorico.some((m) => m.metaReceita) && (
                  <div className="space-y-1.5 border-t border-border pt-3">
                    <p className="text-[11px] text-muted-foreground">Histórico</p>
                    {metasHistorico
                      .filter((m) => m.metaReceita)
                      .map((m) => (
                        <div
                          key={m.mesReferencia}
                          className="flex items-center justify-between text-xs text-muted-foreground"
                        >
                          <span>{mesLabel(m.mesReferencia)}</span>
                          <span className="font-mono tabular-nums">
                            {CURRENCY_FULL.format(Number(centavosParaReais(m.metaReceita)))} ·{" "}
                            {m.metaPedidos} pedidos
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className={cn("space-y-1", !metasEditaveis[0]?.metaReceita && "opacity-60")}>
                <p className="text-xs text-muted-foreground">
                  {mesLabel(metasEditaveis[0]?.mesReferencia ?? mesReferenciaOffset(0))}
                </p>
                {metasEditaveis[0]?.metaReceita ? (
                  <p className="font-mono text-lg font-semibold tabular-nums">
                    {CURRENCY_FULL.format(Number(centavosParaReais(metasEditaveis[0].metaReceita)))}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {metasEditaveis[0].metaPedidos} pedidos
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A rede ainda não definiu a meta deste mês.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Preferências</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Modo escuro</Label>
                <p className="text-xs text-muted-foreground">Tema visual do painel</p>
              </div>
              <Switch checked={tema === "dark"} onCheckedChange={handleToggleTema} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <Label className="text-sm font-medium">Som de novo pedido</Label>
                <p className="text-xs text-muted-foreground">
                  Toca um aviso sonoro quando um pedido chega
                </p>
              </div>
              <Switch checked={somPedido} onCheckedChange={handleToggleSom} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <Label className="text-sm font-medium">Som de avisos de horário</Label>
                <p className="text-xs text-muted-foreground">
                  Toca quando a unidade está a 30 min de abrir ou fechar
                </p>
              </div>
              <Switch checked={somAvisosHorario} onCheckedChange={handleToggleSomAvisosHorario} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <Button variant="outline" className="w-full gap-2" onClick={handleSair}>
              <LogOut className="size-4" />
              Sair da conta
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
