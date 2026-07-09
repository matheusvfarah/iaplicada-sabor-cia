import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Sem overrides pesados de cor aqui: o richColors + a prop `theme`
// (passada de fora, reativa ao tema do app) já resolvem os tons
// certos por tipo de toast (success/warning/error). Forçar
// `bg-background` em tudo antes brigava com isso e deixava o toast
// claro/deslavado no modo escuro.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{ classNames: { toast: "shadow-lg" } }}
      {...props}
    />
  );
};

export { Toaster };
