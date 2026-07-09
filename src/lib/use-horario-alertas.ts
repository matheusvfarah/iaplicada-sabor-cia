import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { playHorarioAlertSound } from "@/lib/notification-sound";
import {
  minutosParaProximaVirada,
  useMinuteTick,
  type HorarioFuncionamento,
} from "@/lib/unidade-status";

export type HorarioAlerta = {
  key: string;
  unidadeId: number;
  unidadeNome: string;
  tipo: "abre" | "fecha";
  minutos: number;
};

type UnidadeParaAlerta = HorarioFuncionamento & {
  id: number;
  nome: string;
  status: "ativa" | "inativa";
};

const LIDOS_KEY = "sabor-cia-horario-alertas-lidos";
const NOTIFICADOS_KEY = "sabor-cia-horario-alertas-notificados";
const JANELA_MIN = 30;

const DIA_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

function hojeSaoPaulo() {
  return DIA_FORMATTER.format(new Date());
}

function readSet(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(storageKey: string, set: Set<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  } catch {
    // localStorage indisponível (modo privado etc.) — segue sem persistir
  }
}

// Hook único: roda a cada 1 min sobre as unidades ATIVAS recebidas e
// calcula quais estão a ≤30 min de abrir/fechar. Dispara toast (+ som,
// se a preferência estiver ligada) uma única vez por dia por unidade —
// dedupe persistido em localStorage, sobrevive a reload de página.
// `toastEnabled` deixa o chamador decidir quando o toast deve tocar
// (gerente: sempre; gestor: só com o sino aberto).
export function useHorarioAlertas(unidades: UnidadeParaAlerta[], toastEnabled = true) {
  useMinuteTick();
  const [lidos, setLidos] = useState<Set<string>>(() => readSet(LIDOS_KEY));
  const notificadosRef = useRef<Set<string>>(readSet(NOTIFICADOS_KEY));

  const alertas = useMemo<HorarioAlerta[]>(() => {
    const dia = hojeSaoPaulo();
    const out: HorarioAlerta[] = [];
    for (const u of unidades) {
      if (u.status !== "ativa") continue;
      const virada = minutosParaProximaVirada(u);
      if (virada.minutos <= JANELA_MIN) {
        out.push({
          key: `${u.id}-${dia}-${virada.tipo}`,
          unidadeId: u.id,
          unidadeNome: u.nome,
          tipo: virada.tipo,
          minutos: virada.minutos,
        });
      }
    }
    return out;
  }, [unidades]);

  useEffect(() => {
    if (!toastEnabled) return;
    let disparouAlgum = false;
    for (const a of alertas) {
      if (notificadosRef.current.has(a.key)) continue;
      notificadosRef.current.add(a.key);
      disparouAlgum = true;
      toast(
        a.tipo === "fecha"
          ? `${a.unidadeNome} fecha em ${a.minutos} min`
          : `${a.unidadeNome} abre em ${a.minutos} min`,
      );
    }
    if (disparouAlgum) {
      writeSet(NOTIFICADOS_KEY, notificadosRef.current);
      playHorarioAlertSound();
    }
  }, [alertas, toastEnabled]);

  const naoLidos = useMemo(() => alertas.filter((a) => !lidos.has(a.key)), [alertas, lidos]);

  function marcarComoLido(key: string) {
    setLidos((prev) => {
      const next = new Set(prev).add(key);
      writeSet(LIDOS_KEY, next);
      return next;
    });
  }

  function marcarTodosComoLidos() {
    setLidos((prev) => {
      const next = new Set(prev);
      for (const a of alertas) next.add(a.key);
      writeSet(LIDOS_KEY, next);
      return next;
    });
  }

  return { alertas, naoLidos, marcarComoLido, marcarTodosComoLidos };
}
