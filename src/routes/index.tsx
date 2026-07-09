import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { session, ready } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      navigate({ to: "/login", replace: true });
    } else if (session.profile.role === "gestor_geral") {
      navigate({ to: "/rede", replace: true });
    } else if (session.profile.unidade_id) {
      navigate({
        to: "/unidade/$unidadeId",
        params: { unidadeId: String(session.profile.unidade_id) },
        replace: true,
      });
    }
    // gerente sem unidade_id: fica na tela abaixo — não há rota sensata
    // pra mandar (ver SemUnidadeVinculada em unidade.$unidadeId.tsx).
  }, [ready, session, navigate]);

  const semUnidade =
    ready && session && session.profile.role === "gerente" && session.profile.unidade_id == null;

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <BrandLogo size="lg" showText={false} />
        {semUnidade ? (
          <div className="max-w-sm">
            <p className="text-sm font-semibold text-foreground">
              Sua conta não está vinculada a nenhuma unidade
            </p>
            <p className="mt-1 text-xs">Contate o administrador da rede.</p>
          </div>
        ) : (
          <p className="text-xs">Carregando operação…</p>
        )}
      </div>
    </div>
  );
}
