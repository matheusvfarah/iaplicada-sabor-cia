import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, MapPin, Calendar, CircleDot } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { AlertsBadge } from "@/components/alerts-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";
import { useUnit } from "@/lib/unit-context";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

type UnidadeDetalhe = {
  nome: string;
  endereco: string;
  status: "ativa" | "inativa";
  data_abertura: string;
};

export const Route = createFileRoute("/dashboard/unit/$unitId/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Sabor & Cia" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const unit = useUnit();
  const navigate = useNavigate();
  const [detalhe, setDetalhe] = useState<UnidadeDetalhe | null>(null);
  const [tema, setTema] = useState<Theme>("dark");
  const [somPedido, setSomPedido] = useState(true);

  useEffect(() => {
    setTema(getStoredTheme());
    setSomPedido(localStorage.getItem("sabor-cia-som-pedido") !== "false");

    let active = true;
    supabase
      .from("unidades")
      .select("nome, endereco, status, data_abertura")
      .eq("id", unit.id)
      .single()
      .then(({ data }) => {
        if (active) setDetalhe(data);
      });
    return () => {
      active = false;
    };
  }, [unit.id]);

  function handleToggleTema(escuro: boolean) {
    const novoTema: Theme = escuro ? "dark" : "light";
    setTema(novoTema);
    applyTheme(novoTema);
  }

  function handleToggleSom(ligado: boolean) {
    setSomPedido(ligado);
    localStorage.setItem("sabor-cia-som-pedido", String(ligado));
    toast.success(ligado ? "Som de novo pedido ativado" : "Som de novo pedido desativado");
  }

  async function handleSair() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <>
      <TopBar title="Configurações" subtitle={unit.nome} actions={<AlertsBadge />} />

      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Dados da unidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!detalhe ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    Nome
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">{detalhe.nome}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{detalhe.endereco}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CircleDot
                    className={`size-3.5 ${detalhe.status === "ativa" ? "text-success" : "text-muted-foreground"}`}
                  />
                  <p className="text-sm text-muted-foreground">
                    {detalhe.status === "ativa" ? "Unidade ativa" : "Unidade inativa"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Aberta em{" "}
                    {new Date(detalhe.data_abertura).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Preferências</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Modo escuro</Label>
                <p className="text-xs text-muted-foreground">Tema visual do painel</p>
              </div>
              <Switch checked={tema === "dark"} onCheckedChange={handleToggleTema} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <Label className="text-sm font-medium">Som de novo pedido</Label>
                <p className="text-xs text-muted-foreground">
                  Toca um aviso sonoro quando um pedido chega
                </p>
              </div>
              <Switch checked={somPedido} onCheckedChange={handleToggleSom} />
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
