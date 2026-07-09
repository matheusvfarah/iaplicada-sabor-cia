import { createContext, useContext } from "react";

export type Unidade = {
  id: number;
  nome: string;
};

export const UnitContext = createContext<Unidade | null>(null);

export function useUnit() {
  const unit = useContext(UnitContext);
  if (!unit) {
    throw new Error("useUnit() precisa ser usado dentro de um layout de unidade");
  }
  return unit;
}
