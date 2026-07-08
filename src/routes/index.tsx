import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getSession } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    const s = getSession();
    if (!s) {
      navigate({ to: "/login", replace: true });
    } else if (s.role === "admin") {
      navigate({ to: "/dashboard", replace: true });
    } else if (s.unitId) {
      navigate({
        to: "/dashboard/unit/$unitId",
        params: { unitId: s.unitId },
        replace: true,
      });
    } else {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <BrandLogo size="lg" showText={false} />
        <p className="font-mono text-xs uppercase tracking-widest">
          Carregando operação…
        </p>
      </div>
    </div>
  );
}
