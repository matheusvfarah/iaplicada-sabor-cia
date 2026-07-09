import { SidebarTrigger } from "@/components/ui/sidebar";
import type { ReactNode } from "react";

export function TopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <SidebarTrigger className="-ml-1" />
      <div className="h-6 w-px bg-border" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-base font-semibold leading-tight sm:text-lg">
          {title}
        </h1>
        {subtitle && (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}