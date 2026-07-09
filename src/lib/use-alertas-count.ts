import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useAlertasCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;

    const fetchCount = () => {
      supabase
        .from("alertas")
        .select("id", { count: "exact", head: true })
        .eq("resolvido", false)
        .then(({ count }) => {
          if (active) setCount(count ?? 0);
        });
    };

    fetchCount();

    const channel = supabase
      .channel("alertas-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas" }, fetchCount)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
