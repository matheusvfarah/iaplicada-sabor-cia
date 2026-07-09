import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Sabor & Cia" },
      {
        name: "description",
        content: "Acesso restrito à plataforma operacional Sabor & Cia.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    try {
      const session = await signIn(email, password);
      if (session.profile.role === "gestor_geral") {
        navigate({ to: "/rede", replace: true });
      } else if (session.profile.unidade_id != null) {
        navigate({
          to: "/unidade/$unidadeId",
          params: { unidadeId: String(session.profile.unidade_id) },
          replace: true,
        });
      } else {
        navigate({ to: "/", replace: true });
      }
    } catch {
      setError("E-mail ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Ambient warm glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-1/3 size-[420px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 size-[360px] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-4">
          <BrandLogo size="lg" showText={false} />
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight">Sabor & Cia</h1>
            <p className="mt-1 text-xs text-muted-foreground">Acesso operacional</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-black/40"
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-medium">
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@saborecia.com.br"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-medium">
              Senha
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Entrando…
              </>
            ) : (
              "Entrar no Dashboard"
            )}
          </Button>

          <p className="border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
            Acesso restrito a parceiros da rede.
          </p>
        </form>
      </div>
    </div>
  );
}
