import { SKIN_OPTIONS } from "./avatarSprites";

export type ShopSkinProduct = {
  id: string;
  skinId: number;
  name: string;
  description: string;
  price: number;
};

export type ShopPackProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  accent: string;
  accentSoft: string;
  glow: string;
  cardPoolIds: string[];
};

export type ShopInventory = {
  ownedSkinIds: number[];
  unopenedPacks: Record<string, number>;
  cardCollection: Record<string, number>;
};

export const SHOP_SKIN_PRODUCTS: ShopSkinProduct[] = [
  { id: "skin-alex", skinId: 1, name: "Skin 2", description: "Fast streetwear town skin.", price: 1800 },
  { id: "skin-caroline", skinId: 2, name: "Skin 3", description: "Festival-ready bright skin.", price: 2400 },
  { id: "skin-demetrius", skinId: 3, name: "Skin 4", description: "Workshop engineer skin.", price: 3000 },
  { id: "skin-elliott", skinId: 4, name: "Skin 5", description: "Seaside storyteller skin.", price: 3600 },
  { id: "skin-vincent", skinId: 5, name: "Skin 6", description: "Classic pixel kid skin.", price: 1500 },
  { id: "skin-vincent-winter", skinId: 6, name: "Skin 7", description: "Snow-day limited skin.", price: 5000 }
];

export const SHOP_PACK_PRODUCTS: ShopPackProduct[] = [
  {
    id: "starter-plus",
    name: "Starter Plus Pack",
    description: "Core staples with a clean upgrade slot.",
    price: 200,
    accent: "#60a5fa",
    accentSoft: "rgba(96, 165, 250, 0.34)",
    glow: "#bfdbfe",
    cardPoolIds: ["skyfire-kite", "cloudbreak-volley"]
  },
  {
    id: "ember-pack",
    name: "Ember Pack",
    description: "Aggressive red pressure with hot chase cards.",
    price: 200,
    accent: "#f97316",
    accentSoft: "rgba(249, 115, 22, 0.36)",
    glow: "#fdba74",
    cardPoolIds: ["ember-fox", "magma-burst", "coal-ambush"]
  },
  {
    id: "tide-pack",
    name: "Tide Pack",
    description: "Tempo spells, bounce, and control tools.",
    price: 200,
    accent: "#38bdf8",
    accentSoft: "rgba(56, 189, 248, 0.34)",
    glow: "#bae6fd",
    cardPoolIds: ["tidal-oracle", "moon-riptide", "mist-mirror"]
  },
  {
    id: "wild-pack",
    name: "Wild Pack",
    description: "Board growth, sticky units, and ambushes.",
    price: 200,
    accent: "#84cc16",
    accentSoft: "rgba(132, 204, 22, 0.34)",
    glow: "#d9f99d",
    cardPoolIds: ["thornhide-stag", "grove-surge", "iron-watcher", "rootlock-grid"]
  }
];

export function normalizeOwnedSkinIds(skinIds: number[]) {
  const validIds = new Set(SKIN_OPTIONS.map((skin) => skin.id));
  return Array.from(new Set(skinIds.filter((skinId) => validIds.has(skinId)))).sort((left, right) => left - right);
}

export function ownsSkin(inventory: Pick<ShopInventory, "ownedSkinIds">, skinId: number) {
  return inventory.ownedSkinIds.includes(skinId);
}

export function normalizeCollection(collection: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(collection).filter(([, count]) => Number.isFinite(count) && Number(count) > 0).map(([cardId, count]) => [cardId, Math.floor(count)])
  );
}
