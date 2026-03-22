import { SKIN_OPTIONS } from "./avatarSprites";

const SHOP_STORAGE_KEY = "focusland-shop-state";

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
};

export type ShopState = {
  ownedSkinIds: number[];
  cardPacks: Record<string, number>;
};

export const SHOP_SKIN_PRODUCTS: ShopSkinProduct[] = [
  { id: "skin-alex", skinId: 1, name: "Alex", description: "Fast streetwear town skin.", price: 120 },
  { id: "skin-caroline", skinId: 2, name: "Caroline", description: "Festival-ready bright skin.", price: 140 },
  { id: "skin-demetrius", skinId: 3, name: "Demetrius", description: "Workshop engineer skin.", price: 160 },
  { id: "skin-elliott", skinId: 4, name: "Elliott", description: "Seaside storyteller skin.", price: 180 },
  { id: "skin-vincent", skinId: 5, name: "Vincent", description: "Classic pixel kid skin.", price: 110 },
  { id: "skin-vincent-winter", skinId: 6, name: "Vincent Winter", description: "Snow-day limited skin.", price: 220 }
];

export const SHOP_PACK_PRODUCTS: ShopPackProduct[] = [
  { id: "starter-plus", name: "Starter Plus Pack", description: "Basic deck staples for new builds.", price: 45 },
  { id: "ember-pack", name: "Ember Pack", description: "Aggressive red card bundle.", price: 80 },
  { id: "tide-pack", name: "Tide Pack", description: "Tempo and control blue cards.", price: 80 },
  { id: "wild-pack", name: "Wild Pack", description: "Ramp and beast support cards.", price: 95 }
];

function normalizeSkinIds(skinIds: number[]) {
  const validIds = new Set(SKIN_OPTIONS.map((skin) => skin.id));
  return Array.from(new Set(skinIds.filter((skinId) => validIds.has(skinId)))).sort((left, right) => left - right);
}

export function loadShopState(currentSkinId?: number): ShopState {
  if (typeof window === "undefined") {
    return {
      ownedSkinIds: normalizeSkinIds([0, currentSkinId ?? 0]),
      cardPacks: {}
    };
  }

  try {
    const raw = window.localStorage.getItem(SHOP_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ShopState>) : {};
    return {
      ownedSkinIds: normalizeSkinIds([0, currentSkinId ?? 0, ...((parsed.ownedSkinIds as number[] | undefined) ?? [])]),
      cardPacks: Object.fromEntries(
        Object.entries(parsed.cardPacks ?? {}).filter(([, count]) => Number.isFinite(count) && Number(count) > 0)
      )
    };
  } catch {
    return {
      ownedSkinIds: normalizeSkinIds([0, currentSkinId ?? 0]),
      cardPacks: {}
    };
  }
}

export function saveShopState(state: ShopState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SHOP_STORAGE_KEY,
    JSON.stringify({
      ownedSkinIds: normalizeSkinIds(state.ownedSkinIds),
      cardPacks: state.cardPacks
    })
  );
}

export function ownsSkin(state: ShopState, skinId: number) {
  return state.ownedSkinIds.includes(skinId);
}

export function unlockSkin(state: ShopState, skinId: number): ShopState {
  return {
    ...state,
    ownedSkinIds: normalizeSkinIds([...state.ownedSkinIds, skinId])
  };
}

export function addCardPack(state: ShopState, packId: string): ShopState {
  return {
    ...state,
    cardPacks: {
      ...state.cardPacks,
      [packId]: (state.cardPacks[packId] ?? 0) + 1
    }
  };
}
