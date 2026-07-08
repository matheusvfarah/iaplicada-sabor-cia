export type Unit = {
  id: string;
  name: string;
  city: string;
  status: "operational" | "rush" | "idle" | "offline";
  revenueMonth: number;
  goalMonth: number;
  ordersMonth: number;
  avgTicket: number;
  rating: number;
};

export type OrderStatus =
  | "novo"
  | "preparo"
  | "entrega"
  | "concluido"
  | "cancelado";

export type Platform = "iFood" | "Rappi" | "UberEats" | "Próprio";

export type Order = {
  id: string;
  createdAt: string; // ISO
  value: number;
  platform: Platform;
  status: OrderStatus;
  customer: string;
  items: number;
};

export const UNITS: Unit[] = [
  {
    id: "centro",
    name: "Centro Gastronômico",
    city: "São Paulo",
    status: "rush",
    revenueMonth: 142_500,
    goalMonth: 160_000,
    ordersMonth: 4_210,
    avgTicket: 84.2,
    rating: 4.8,
  },
  {
    id: "jardins",
    name: "Jardins Gourmet",
    city: "São Paulo",
    status: "operational",
    revenueMonth: 118_900,
    goalMonth: 130_000,
    ordersMonth: 3_120,
    avgTicket: 78.4,
    rating: 4.7,
  },
  {
    id: "vila-madalena",
    name: "Vila Madalena Hub",
    city: "São Paulo",
    status: "idle",
    revenueMonth: 94_200,
    goalMonth: 110_000,
    ordersMonth: 2_810,
    avgTicket: 68.9,
    rating: 4.5,
  },
  {
    id: "batel",
    name: "Batel Kitchen",
    city: "Curitiba",
    status: "operational",
    revenueMonth: 87_400,
    goalMonth: 95_000,
    ordersMonth: 2_450,
    avgTicket: 71.5,
    rating: 4.6,
  },
  {
    id: "leblon",
    name: "Leblon Sunset",
    city: "Rio de Janeiro",
    status: "offline",
    revenueMonth: 72_800,
    goalMonth: 100_000,
    ordersMonth: 1_980,
    avgTicket: 82.1,
    rating: 4.4,
  },
];

export const MONTHLY_REVENUE = [
  { month: "Jan", centro: 98, jardins: 82, vila: 65, batel: 60, leblon: 55 },
  { month: "Fev", centro: 112, jardins: 88, vila: 71, batel: 66, leblon: 58 },
  { month: "Mar", centro: 121, jardins: 94, vila: 79, batel: 72, leblon: 62 },
  { month: "Abr", centro: 135, jardins: 108, vila: 88, batel: 78, leblon: 68 },
  { month: "Mai", centro: 128, jardins: 115, vila: 92, batel: 82, leblon: 70 },
  { month: "Jun", centro: 142, jardins: 119, vila: 94, batel: 87, leblon: 73 },
];

const PLATFORMS: Platform[] = ["iFood", "Rappi", "UberEats", "Próprio"];
const STATUSES: OrderStatus[] = [
  "novo",
  "preparo",
  "entrega",
  "concluido",
  "concluido",
  "concluido",
  "cancelado",
];
const NAMES = [
  "Marina Silva",
  "João Pereira",
  "Ana Costa",
  "Rafael Souza",
  "Beatriz Lima",
  "Carlos Mendes",
  "Fernanda Rocha",
  "Diego Alves",
  "Larissa Torres",
  "Bruno Faria",
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function generateOrders(unitId: string, count = 24): Order[] {
  const rand = seededRandom(unitId.length * 131 + count);
  const now = Date.now();
  return Array.from({ length: count }).map((_, i) => {
    const platform = PLATFORMS[Math.floor(rand() * PLATFORMS.length)];
    const status = STATUSES[Math.floor(rand() * STATUSES.length)];
    const value = Math.round((30 + rand() * 180) * 100) / 100;
    const customer = NAMES[Math.floor(rand() * NAMES.length)];
    return {
      id: `#${9000 + i + Math.floor(rand() * 400)}`,
      createdAt: new Date(now - i * 7 * 60_000).toISOString(),
      value,
      platform,
      status,
      customer,
      items: 1 + Math.floor(rand() * 5),
    };
  });
}

export function getUnitById(id: string): Unit | undefined {
  return UNITS.find((u) => u.id === id);
}

export const NETWORK_KPIS = {
  deliveryRate: 94.2,
  deliveryRateTrend: 2.1,
  avgTicket: 76.8,
  cancellationRate: 1.8,
  cancellationTarget: 2.5,
  totalRevenue: UNITS.reduce((s, u) => s + u.revenueMonth, 0),
  totalOrders: UNITS.reduce((s, u) => s + u.ordersMonth, 0),
};

export const CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export const CURRENCY_FULL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});