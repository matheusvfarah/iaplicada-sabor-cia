import { useEffect, useState } from "react";

export type HorarioFuncionamento = {
  horario_abertura: string; // "HH:MM:SS" ou "HH:MM" vindo do Postgres `time`
  horario_fechamento: string;
};

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Considera o fechamento depois da meia-noite (ex.: 18:00–02:00).
export function isUnidadeAberta(h: HorarioFuncionamento, now = new Date()): boolean {
  const openMin = toMinutes(h.horario_abertura);
  const closeMin = toMinutes(h.horario_fechamento);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (closeMin === openMin) return true; // 24h
  if (closeMin > openMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin;
}

function minutesUntil(targetHHMM: string, now = new Date()) {
  const targetMin = toMinutes(targetHHMM);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let diff = targetMin - nowMin;
  if (diff < 0) diff += 24 * 60;
  if (diff === 0) diff = 24 * 60;
  return diff;
}

// Minutos até a próxima virada de status (abre ou fecha), e qual é.
export function minutosParaProximaVirada(
  h: HorarioFuncionamento,
  now = new Date(),
): { tipo: "abre" | "fecha"; minutos: number } {
  const aberta = isUnidadeAberta(h, now);
  return aberta
    ? { tipo: "fecha", minutos: minutesUntil(h.horario_fechamento, now) }
    : { tipo: "abre", minutos: minutesUntil(h.horario_abertura, now) };
}

// Força recomputo de status derivado de horário a cada minuto.
export function useMinuteTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return tick;
}
