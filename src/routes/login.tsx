import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSession, type Role } from "@/lib/auth";
import { UNITS } from "@/lib/mock-data";
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
  const [role, setRole] = useState<Role>("admin");
  const [unitId, setUnitId] = useState(UNITS[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const name =
        email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) =>
          c.toUpperCase(),
        ) || "Operador";
      saveSession({
        email,
        role,
        unitId: role === "unit" ? unitId : undefined,
        name,
      });
      if (role === "admin") {
        navigate({ to: "/dashboard", replace: true });
      } else {
        navigate({
          to: "/dashboard/unit/$unitId",
          params: { unitId },
          replace: true,
        });
      }
    }, 500);
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
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Sabor & Cia
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Acesso Operacional
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-black/40"
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs uppercase tracking-wider">
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
            <Label
              htmlFor="password"
              className="text-xs uppercase tracking-wider"
            >
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

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider">Perfil</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["admin", "unit"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    role === r
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface hover:bg-surface-hover"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${role === r ? "text-primary" : "text-foreground"}`}
                  >
                    {r === "admin" ? "Gestor de Rede" : "Operador Unidade"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {r === "admin"
                      ? "Todas as cozinhas"
                      : "Somente a unidade"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {role === "unit" && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider">
                Unidade
              </Label>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.city}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            className="h-11 w-full text-sm font-semibold"
            disabled={loading}
          >
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
            <br />
            Autenticação Supabase será conectada em breve.
          </p>
        </form>
      </div>
    </div>
  );
}