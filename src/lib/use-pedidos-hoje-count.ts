import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

let instanceCounter = 0;

export function usePedidosHojeCount(unidadeId: number | null) {
  const [count, setCount] = useState(0);
  const instanceId = useRef(++instanceCounter);

  useEffect(() => {
    if (unidadeId == null) return;
    let active = true;

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
        .gte("data_pedido", startOfToday())
        .then(({ count }) => {
          if (active) setCount(count ?? 0);
        });
    };

    fetchCount();

    const channel = supabase
      .channel(`pedidos-hoje-${unidadeId}-${instanceId.current}`)
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
