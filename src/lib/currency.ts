export const CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export const CURRENCY_FULL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
