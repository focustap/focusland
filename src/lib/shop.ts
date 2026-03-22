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
  raritySlots: Array<Record<"common" | "uncommon" | "rare" | "epic" | "legendary", number>>;
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
    name: "Bronze Pack",
    description: "Budget entry pack. Mostly commons and uncommons, but still live for rares.",
    price: 100,
    accent: "#60a5fa",
    accentSoft: "rgba(96, 165, 250, 0.34)",
    glow: "#bfdbfe",
    raritySlots: [
      { common: 60, uncommon: 30, rare: 10, epic: 0, legendary: 0 },
      { common: 45, uncommon: 40, rare: 13, epic: 2, legendary: 0 },
      { common: 25, uncommon: 45, rare: 24, epic: 6, legendary: 0 },
      { common: 0, uncommon: 30, rare: 45, epic: 20, legendary: 5 },
      { common: 0, uncommon: 15, rare: 50, epic: 28, legendary: 7 }
    ]
  },
  {
    id: "ember-pack",
    name: "Silver Pack",
    description: "Steadier rare rate with a meaningful epic ceiling.",
    price: 250,
    accent: "#f97316",
    accentSoft: "rgba(249, 115, 22, 0.36)",
    glow: "#fdba74",
    raritySlots: [
      { common: 45, uncommon: 40, rare: 15, epic: 0, legendary: 0 },
      { common: 30, uncommon: 45, rare: 20, epic: 5, legendary: 0 },
      { common: 0, uncommon: 35, rare: 40, epic: 20, legendary: 5 },
      { common: 0, uncommon: 0, rare: 45, epic: 35, legendary: 20 },
      { common: 0, uncommon: 0, rare: 30, epic: 45, legendary: 25 }
    ]
  },
  {
    id: "tide-pack",
    name: "Gold Pack",
    description: "Mid-tier vault pack with strong rare and epic density.",
    price: 500,
    accent: "#38bdf8",
    accentSoft: "rgba(56, 189, 248, 0.34)",
    glow: "#bae6fd",
    raritySlots: [
      { common: 20, uncommon: 45, rare: 25, epic: 10, legendary: 0 },
      { common: 0, uncommon: 35, rare: 35, epic: 22, legendary: 8 },
      { common: 0, uncommon: 20, rare: 40, epic: 28, legendary: 12 },
      { common: 0, uncommon: 0, rare: 32, epic: 43, legendary: 25 },
      { common: 0, uncommon: 0, rare: 20, epic: 50, legendary: 30 }
    ]
  },
  {
    id: "wild-pack",
    name: "Platinum Pack",
    description: "Late-game buyer pack. Epics show up regularly and legendaries are real hits.",
    price: 750,
    accent: "#84cc16",
    accentSoft: "rgba(132, 204, 22, 0.34)",
    glow: "#d9f99d",
    raritySlots: [
      { common: 0, uncommon: 40, rare: 35, epic: 18, legendary: 7 },
      { common: 0, uncommon: 25, rare: 40, epic: 25, legendary: 10 },
      { common: 0, uncommon: 0, rare: 38, epic: 37, legendary: 25 },
      { common: 0, uncommon: 0, rare: 24, epic: 46, legendary: 30 },
      { common: 0, uncommon: 0, rare: 12, epic: 50, legendary: 38 }
    ]
  },
  {
    id: "crown-pack",
    name: "Crown Pack",
    description: "Top-tier premium pack. Built to chase epics and legendaries.",
    price: 1000,
    accent: "#c084fc",
    accentSoft: "rgba(192, 132, 252, 0.34)",
    glow: "#e9d5ff",
    raritySlots: [
      { common: 0, uncommon: 30, rare: 40, epic: 22, legendary: 8 },
      { common: 0, uncommon: 0, rare: 36, epic: 40, legendary: 24 },
      { common: 0, uncommon: 0, rare: 25, epic: 45, legendary: 30 },
      { common: 0, uncommon: 0, rare: 14, epic: 50, legendary: 36 },
      { common: 0, uncommon: 0, rare: 0, epic: 52, legendary: 48 }
    ]
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
