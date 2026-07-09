import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { playNotificationSound, playHorarioAlertSound } from "@/lib/notification-sound";

export type TipoNotificacao =
  "pedido_novo" | "pedido_cancelado_auto" | "pedido_atrasado" | "vai_abrir" | "vai_fechar";

export type Notificacao = {
  id: number;
  unidade_id: number;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  ref_pedido_id: number | null;
  criado_em: string;
  lida: boolean;
};

export const TIPOS_HORARIO = new Set<TipoNotificacao>(["vai_abrir", "vai_fechar"]);
export const TIPOS_OPERACIONAIS = new Set<TipoNotificacao>([
  "pedido_novo",
  "pedido_cancelado_auto",
  "pedido_atrasado",
]);

const SELECT_COLS = "id, unidade_id, tipo, titulo, mensagem, ref_pedido_id, criado_em, lida";

// Tudo nasce no banco (gerar_notificacoes(), triggers) — este hook só
// lê. RLS já restringe as linhas à do próprio profile_id, então gerente
// e gestor recebem exatamente o conjunto que lhes cabe sem filtro
// extra aqui; quem filtra por tipo/unidade pra decidir o que aparece
// no sino vs. no badge da sidebar é o consumidor (ver
// notifications-bell.tsx e app-sidebar.tsx).
export function useNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);

  useEffect(() => {
    let active = true;

    supabase
      .from("notificacoes")
      .select(SELECT_COLS)
      .eq("lida", false)
      .order("criado_em", { ascending: false })
      .then(({ data }) => {
        if (active) setNotificacoes((data as Notificacao[]) ?? []);
      });

    const channel = supabase
      .channel("notificacoes-usuario")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes" },
        (payload) => {
          const row = payload.new as Notificacao;
          setNotificacoes((prev) => [row, ...prev]);
          toast(row.titulo, { description: row.mensagem });
          if (TIPOS_HORARIO.has(row.tipo)) playHorarioAlertSound();
          else playNotificationSound();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notificacoes" },
        (payload) => {
          const row = payload.new as Notificacao;
          setNotificacoes((prev) =>
            row.lida
              ? prev.filter((n) => n.id !== row.id)
              : prev.map((n) => (n.id === row.id ? row : n)),
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  async function marcarComoLida(id: number) {
    setNotificacoes((prev) => prev.filter((n) => n.id !== id));
    await supabase
      .from("notificacoes")
      .update({ lida: true, lida_em: new Date().toISOString() })
      .eq("id", id);
  }

  async function marcarVariasComoLidas(ids: number[]) {
    if (ids.length === 0) return;
    setNotificacoes((prev) => prev.filter((n) => !ids.includes(n.id)));
    await supabase
      .from("notificacoes")
      .update({ lida: true, lida_em: new Date().toISOString() })
      .in("id", ids);
  }

  return { notificacoes, marcarComoLida, marcarVariasComoLidas };
}
