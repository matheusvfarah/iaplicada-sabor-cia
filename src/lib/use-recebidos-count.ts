import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

let instanceCounter = 0;

export function useRecebidosCount(unidadeId: number | null) {
  const [count, setCount] = useState(0);
  const instanceId = useRef(++instanceCounter);

  useEffect(() => {
    if (unidadeId == null) return;
    let active = true;

    // Mesmo escopo "hoje" do kanban de Pedidos — senão o badge mostra
    // um número que não bate com o que a coluna Recebidos realmente
    // exibe (pedidos antigos do histórico não contam mais).
    const startOfToday = () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    };

    const fetchCount = () => {
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("unidade_id", unidadeId)
        .eq("status", "recebido")
        .gte("data_pedido", startOfToday())
        .then(({ count }) => {
          if (active) setCount(count ?? 0);
        });
    };

    fetchCount();

    // Nome único por instância — este hook pode montar em mais de um
    // componente ao mesmo tempo (sidebar + nav mobile), e o Supabase
    // Realtime não deixa reusar o nome de um canal já inscrito.
    const channel = supabase
      .channel(`recebidos-${unidadeId}-${instanceId.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `unidade_id=eq.${unidadeId}` },
        fetchCount,
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [unidadeId]);

  return count;
}
