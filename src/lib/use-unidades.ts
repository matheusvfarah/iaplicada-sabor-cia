import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { HorarioFuncionamento } from "@/lib/unidade-status";

export type UnidadeResumo = HorarioFuncionamento & {
  id: number;
  nome: string;
  status: "ativa" | "inativa";
};

// Lista de unidades é pedida por vários componentes ao mesmo tempo em
// toda navegação (sidebar, sino de alertas, Configurações da rede) —
// antes cada um disparava a própria query. Com staleTime global de 60s
// (ver router.tsx), o cache do TanStack Query dedupe isso pra uma
// única requisição por janela de 60s, em vez de 3+ por página.
export function useUnidades() {
  return useQuery({
    queryKey: ["unidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades")
        .select("id, nome, status, horario_abertura, horario_fechamento")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as UnidadeResumo[];
    },
  });
}
