import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { useUnit } from "@/lib/unit-context";

export const Route = createFileRoute("/dashboard/unit/$unitId/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Sabor & Cia" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const unit = useUnit();
  return (
    <>
      <TopBar title="Configurações" subtitle={unit.nome} actions={<AlertsBadge />} />
      <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">Em construção — Fase 4.</p>
      </div>
    </>
  );
}
