import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/rede")({
  component: RedeLayout,
});

function RedeLayout() {
  const navigate = useNavigate();
  const { session, ready } = useSession();

  // Gerente nunca vê a rede — só a própria unidade (item 6: nunca
  // renderizar caminho para outras unidades).
  useEffect(() => {
    if (!ready || !session) return;
    if (session.profile.role === "gerente" && session.profile.unidade_id != null) {
      navigate({
        to: "/unidade/$unidadeId",
        params: { unidadeId: String(session.profile.unidade_id) },
        replace: true,
      });
    }
  }, [ready, session, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
