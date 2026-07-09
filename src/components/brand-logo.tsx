import logo from "@/assets/logo.png";

export function BrandLogo({
  size = "md",
  showText = true,
  variant = "on-light",
}: {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "on-dark" | "on-light";
}) {
  const dims = size === "lg" ? "size-12" : size === "sm" ? "size-7" : "size-9";
  const imgPad = size === "lg" ? "p-2" : size === "sm" ? "p-1" : "p-1.5";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${dims} shrink-0 overflow-hidden rounded-[9px] ${
          variant === "on-dark" ? `bg-accent ${imgPad}` : ""
        }`}
      >
        <img src={logo} alt="Sabor & Cia" className="size-full object-contain" />
      </div>
      {showText && (
        <div className="leading-tight">
          <span
            className={`block font-display font-semibold tracking-tight ${text} ${
              variant === "on-dark" ? "text-sidebar-foreground" : "text-foreground"
            }`}
          >
            Sabor & Cia
          </span>
          <span
            className={`block text-[10px] uppercase tracking-[0.16em] ${
              variant === "on-dark" ? "text-sidebar-foreground/60" : "text-muted-foreground"
            }`}
          >
            cucina italiana
          </span>
        </div>
      )}
    </div>
  );
}
