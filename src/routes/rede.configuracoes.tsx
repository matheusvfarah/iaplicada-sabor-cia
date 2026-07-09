import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/rede/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Sabor & Cia" }] }),
  component: RedeConfiguracoesPage,
});

function RedeConfiguracoesPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [tema, setTema] = useState<Theme>("dark");

  useEffect(() => {
    setTema(getStoredTheme());
  }, []);

  function handleToggleTema(escuro: boolean) {
    const novoTema: Theme = escuro ? "dark" : "light";
    setTema(novoTema);
    applyTheme(novoTema);
  }

  async function handleSair() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <>
      <TopBar title="Configurações" subtitle="Preferências da conta" actions={<AlertsBadge />} />

      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Nome</p>
              <p className="mt-0.5 text-sm font-semibold">{session?.profile.nome}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Papel</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Gestor de Rede</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Preferências</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Modo escuro</Label>
                <p className="text-xs text-muted-foreground">Tema visual do painel</p>
              </div>
              <Switch checked={tema === "dark"} onCheckedChange={handleToggleTema} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <Button variant="outline" className="w-full gap-2" onClick={handleSair}>
              <LogOut className="size-4" />
              Sair da conta
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
