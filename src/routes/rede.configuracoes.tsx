import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, Store } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { signOut, useSession } from "@/lib/auth";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

type UnidadeResumo = { id: number; nome: string; status: "ativa" | "inativa" };

export const Route = createFileRoute("/rede/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Sabor & Cia" }] }),
  component: RedeConfiguracoesPage,
});

function RedeConfiguracoesPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [tema, setTema] = useState<Theme>("dark");
  const [unidades, setUnidades] = useState<UnidadeResumo[]>([]);
  const [loadingUnidades, setLoadingUnidades] = useState(true);
  const [pendingToggle, setPendingToggle] = useState<UnidadeResumo | null>(null);
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  useEffect(() => {
    setTema(getStoredTheme());
    supabase
      .from("unidades")
      .select("id, nome, status")
      .order("nome")
      .then(({ data }) => {
        setUnidades((data as UnidadeResumo[]) ?? []);
        setLoadingUnidades(false);
      });
  }, []);

  function handleToggleTema(escuro: boolean) {
    const novoTema: Theme = escuro ? "dark" : "light";
    setTema(novoTema);
    applyTheme(novoTema);
  }

  async function handleConfirmarToggle() {
    if (!pendingToggle) return;
    const novoStatus = pendingToggle.status === "ativa" ? "inativa" : "ativa";
    setSalvandoStatus(true);
    const { error } = await supabase
      .from("unidades")
      .update({ status: novoStatus })
      .eq("id", pendingToggle.id);
    setSalvandoStatus(false);
    setPendingToggle(null);
    if (error) {
      toast.error("Não foi possível atualizar a unidade", { description: error.message });
      return;
    }
    setUnidades((prev) =>
      prev.map((u) => (u.id === pendingToggle.id ? { ...u, status: novoStatus } : u)),
    );
    toast.success(
      novoStatus === "ativa" ? `${pendingToggle.nome} ativada` : `${pendingToggle.nome} desativada`,
    );
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
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Store className="size-4 text-primary" />
              Unidades
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {loadingUnidades ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : (
              unidades.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0"
                >
                  <div>
                    <p
                      className={`text-sm font-medium ${u.status === "inativa" ? "text-muted-foreground" : ""}`}
                    >
                      {u.nome}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {u.status === "ativa" ? "Ativa" : "Inativa"}
                    </p>
                  </div>
                  <Switch
                    checked={u.status === "ativa"}
                    disabled={salvandoStatus}
                    onCheckedChange={() => setPendingToggle(u)}
                  />
                </div>
              ))
            )}
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

      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle?.status === "ativa"
                ? `Desativar ${pendingToggle?.nome}?`
                : `Ativar ${pendingToggle?.nome}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingToggle?.status === "ativa"
                ? "Ela sai das listas e do ranking até ser reativada."
                : "Ela volta a aparecer nas listas e no ranking."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarToggle} disabled={salvandoStatus}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
