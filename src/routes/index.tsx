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
      navigate({ to: "/dashboard", replace: true });
    } else if (session.profile.unidade_id) {
      navigate({
        to: "/dashboard/unit/$unitId",
        params: { unitId: String(session.profile.unidade_id) },
        replace: true,
      });
    } else {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [ready, session, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <BrandLogo size="lg" showText={false} />
        <p className="font-mono text-xs uppercase tracking-widest">Carregando operação…</p>
      </div>
    </div>
  );
}
