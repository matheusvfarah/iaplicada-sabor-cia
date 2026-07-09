import { Bell, CheckCircle2, PackageOpen, XCircle, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "@/lib/auth";
import { useNotificacoesCtx } from "@/lib/notificacoes-context";
import { TIPOS_HORARIO, type Notificacao, type TipoNotificacao } from "@/lib/use-notificacoes";
import { cn } from "@/lib/utils";

const TIPO_ICON: Record<TipoNotificacao, typeof Bell> = {
  pedido_novo: PackageOpen,
  pedido_cancelado_auto: XCircle,
  pedido_atrasado: AlertTriangle,
  vai_abrir: Clock,
  vai_fechar: Clock,
};

// Hierarquia visual: atrasado/cancelado = vermelho, pedido novo =
// âmbar, horário = neutro — cor só no ícone, nunca na linha inteira.
const TIPO_ICON_CLASS: Record<TipoNotificacao, string> = {
  pedido_novo: "text-accent-tint-foreground",
  pedido_cancelado_auto: "text-destructive",
  pedido_atrasado: "text-destructive",
  vai_abrir: "text-muted-foreground",
  vai_fechar: "text-muted-foreground",
};

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

// Gerente: recebe os 5 tipos, sempre da própria unidade (garantido no
// banco — não precisa filtrar aqui). Gestor: só horário no sino,
// exceto quando está "dentro" de uma unidade (unidadeIdAtual), aí os
// tipos operacionais daquela unidade migram pro sino também — ver
// spec da Fase 3.
export function NotificationsBell({ unidadeIdAtual }: { unidadeIdAtual?: number }) {
  const { session } = useSession();
  const { notificacoes, marcarComoLida, marcarVariasComoLidas } = useNotificacoesCtx();

  const isGestor = session?.profile.role === "gestor_geral";

  const visiveis = isGestor
    ? notificacoes.filter(
        (n) =>
          TIPOS_HORARIO.has(n.tipo) || (unidadeIdAtual != null && n.unidade_id === unidadeIdAtual),
      )
    : notificacoes;

  function handleMarcarTodas() {
    marcarVariasComoLidas(visiveis.map((n) => n.id));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative size-9">
          <Bell className="size-4" />
          {visiveis.length > 0 && (
            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              {visiveis.length > 9 ? "9+" : visiveis.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="font-display text-sm font-semibold">Notificações</p>
            <p className="text-[11px] text-muted-foreground">
              {visiveis.length > 0 ? `${visiveis.length} não lida(s)` : "Nenhuma notificação"}
            </p>
          </div>
          {visiveis.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={handleMarcarTodas}
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-auto">
          {visiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <CheckCircle2 className="size-6 text-success" />
              <p className="text-xs text-muted-foreground">Tudo em dia por aqui.</p>
            </div>
          ) : (
            visiveis.map((n: Notificacao) => {
              const Icon = TIPO_ICON[n.tipo];
              return (
                <div key={n.id} className="border-b border-border p-3 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <Icon className={cn("mt-0.5 size-3.5 shrink-0", TIPO_ICON_CLASS[n.tipo])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold">{n.titulo}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatRelativeTime(n.criado_em)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{n.mensagem}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1.5 h-6 px-2 text-[11px]"
                        onClick={() => marcarComoLida(n.id)}
                      >
                        Marcar como lida
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
