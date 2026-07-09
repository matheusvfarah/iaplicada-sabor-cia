import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, UserPlus, Pencil, Trash2, Users } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { NotificationsBell } from "@/components/notifications-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { useUnit } from "@/lib/unit-context";

type Funcionario = {
  id: number;
  nome: string;
  cargo: string;
  email: string;
};

type FormState = { nome: string; cargo: string; email: string };

const FORM_VAZIO: FormState = { nome: "", cargo: "", email: "" };

export const Route = createFileRoute("/unidade/$unidadeId/funcionarios")({
  head: () => ({ meta: [{ title: "Funcionários — Sabor & Cia" }] }),
  component: FuncionariosPage,
});

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

// Mensagem amigável pro erro de e-mail duplicado (constraint unique
// na coluna) — a RLS pode barrar antes disso pra outra unidade, mas
// esse é especificamente o caso de conflito de dado, não de permissão.
function mensagemErro(error: { code?: string; message: string }) {
  if (error.code === "23505") return "Esse e-mail já está cadastrado para outro funcionário.";
  return error.message;
}

function FuncionariosPage() {
  const unit = useUnit();
  const [loading, setLoading] = useState(true);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [paraRemover, setParaRemover] = useState<Funcionario | null>(null);
  const [removendo, setRemovendo] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("funcionarios")
      .select("id, nome, cargo, email")
      .eq("unidade_id", unit.id)
      .order("nome")
      .then(({ data }) => {
        if (!active) return;
        setFuncionarios(data ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [unit.id]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return funcionarios;
    return funcionarios.filter((f) => f.nome.toLowerCase().includes(termo));
  }, [funcionarios, busca]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(f: Funcionario) {
    setEditando(f);
    setForm({ nome: f.nome, cargo: f.cargo, email: f.email });
    setModalAberto(true);
  }

  async function handleSalvar() {
    const nome = form.nome.trim();
    const cargo = form.cargo.trim();
    const email = form.email.trim().toLowerCase();
    if (!nome || !cargo || !email) {
      toast.error("Preencha nome, cargo e e-mail.");
      return;
    }

    setSalvando(true);
    if (editando) {
      const { data, error } = await supabase
        .from("funcionarios")
        .update({ nome, cargo, email })
        .eq("id", editando.id)
        .select("id, nome, cargo, email")
        .single();
      setSalvando(false);
      if (error) {
        toast.error("Não foi possível salvar", { description: mensagemErro(error) });
        return;
      }
      setFuncionarios((prev) => prev.map((f) => (f.id === editando.id ? data : f)));
      toast.success("Funcionário atualizado");
    } else {
      const { data, error } = await supabase
        .from("funcionarios")
        .insert({ nome, cargo, email, unidade_id: unit.id })
        .select("id, nome, cargo, email")
        .single();
      setSalvando(false);
      if (error) {
        toast.error("Não foi possível adicionar", { description: mensagemErro(error) });
        return;
      }
      setFuncionarios((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      toast.success("Funcionário adicionado");
    }
    setModalAberto(false);
  }

  async function handleRemover() {
    if (!paraRemover) return;
    setRemovendo(true);
    const { error } = await supabase.from("funcionarios").delete().eq("id", paraRemover.id);
    setRemovendo(false);
    setParaRemover(null);
    if (error) {
      toast.error("Não foi possível remover", { description: mensagemErro(error) });
      return;
    }
    setFuncionarios((prev) => prev.filter((f) => f.id !== paraRemover.id));
    toast.success("Funcionário removido");
  }

  return (
    <>
      <TopBar
        title="Funcionários"
        subtitle={loading ? "Carregando…" : `${funcionarios.length} funcionário(s)`}
        actions={
          <>
            <Button size="sm" onClick={abrirNovo} className="gap-1.5">
              <UserPlus className="size-3.5" />
              Adicionar
            </Button>
            <NotificationsBell unidadeIdAtual={unit.id} />
          </>
        }
      />

      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <Users className="mb-3 size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              Nenhum funcionário encontrado
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtrados.map((f) => (
              <Card key={f.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="text-xs font-semibold">
                      {iniciais(f.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{f.nome}</p>
                      <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
                        {f.cargo}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{f.email}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => abrirEdicao(f)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setParaRemover(f)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar funcionário" : "Adicionar funcionário"}</DialogTitle>
            <DialogDescription>
              {unit.nome} · dados usados só internamente, sem acesso ao sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cargo</Label>
              <Input
                value={form.cargo}
                onChange={(e) => setForm((prev) => ({ ...prev, cargo: e.target.value }))}
                placeholder="Ex.: Cozinheiro, Atendente"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="nome@saborecia.com.br"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setModalAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {editando ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!paraRemover} onOpenChange={(open) => !open && setParaRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {paraRemover?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemover} disabled={removendo}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
