import { Flame } from "lucide-react";

export function BrandLogo({
  size = "md",
  showText = true,
}: {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}) {
  const dims = size === "lg" ? "size-12" : size === "sm" ? "size-7" : "size-9";
  const iconSize = size === "lg" ? "size-6" : size === "sm" ? "size-3.5" : "size-4.5";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${dims} grid place-items-center rounded-lg bg-primary shadow-[0_0_24px_-6px_var(--primary)] shrink-0`}
      >
        <Flame
          className={`${iconSize} fill-primary-foreground text-primary-foreground`}
          strokeWidth={2.2}
        />
      </div>
      {showText && (
        <span className={`font-display font-bold tracking-tight ${text} text-foreground`}>
          Sabor & Cia
        </span>
      )}
    </div>
  );
}
