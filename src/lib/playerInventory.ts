import { DEFAULT_AVATAR_CUSTOMIZATION, SKIN_OPTIONS } from "./avatarSprites";
import { CARD_LIBRARY, PACK_EXCLUSIVE_CARD_IDS } from "./card-game/cards";
import {
  normalizeCollection,
  normalizeOwnedSkinIds,
  type ShopInventory
} from "./shop";
import { supabase } from "./supabase";

const LOCAL_INVENTORY_STORAGE_KEY = "focusland-player-inventory-v1";

type InventoryLoadResult = {
  inventory: ShopInventory;
  persistedToDatabase: boolean;
  usedLocalFallback: boolean;
  errorMessage?: string;
};

type InventorySaveResult = {
  inventory: ShopInventory;
  persistedToDatabase: boolean;
  errorMessage?: string;
};

function getStarterCollection() {
  return Object.fromEntries(
    CARD_LIBRARY.filter((card) => !PACK_EXCLUSIVE_CARD_IDS.has(card.id)).map((card) => [card.id, 2])
  ) as Record<string, number>;
}

function getBaseInventory(currentSkinId?: number): ShopInventory {
  return {
    ownedSkinIds: normalizeOwnedSkinIds([DEFAULT_AVATAR_CUSTOMIZATION.skinId, currentSkinId ?? DEFAULT_AVATAR_CUSTOMIZATION.skinId]),
    unopenedPacks: {},
    cardCollection: getStarterCollection()
  };
}

function normalizePackInventory(packs: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(packs).filter(([, count]) => Number.isFinite(count) && Number(count) > 0).map(([packId, count]) => [packId, Math.floor(count)])
  );
}

function normalizeInventory(raw: Partial<ShopInventory> | null | undefined, currentSkinId?: number): ShopInventory {
  const base = getBaseInventory(currentSkinId);
  return {
    ownedSkinIds: normalizeOwnedSkinIds([...(raw?.ownedSkinIds ?? []), ...base.ownedSkinIds]),
    unopenedPacks: normalizePackInventory({ ...base.unopenedPacks, ...(raw?.unopenedPacks ?? {}) }),
    cardCollection: normalizeCollection({ ...base.cardCollection, ...(raw?.cardCollection ?? {}) })
  };
}

function readLocalInventory(currentSkinId?: number): ShopInventory {
  if (typeof window === "undefined") {
    return getBaseInventory(currentSkinId);
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_INVENTORY_STORAGE_KEY);
    if (!raw) {
      return getBaseInventory(currentSkinId);
    }

    return normalizeInventory(JSON.parse(raw) as Partial<ShopInventory>, currentSkinId);
  } catch {
    return getBaseInventory(currentSkinId);
  }
}

function writeLocalInventory(inventory: ShopInventory) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_INVENTORY_STORAGE_KEY, JSON.stringify(inventory));
}

async function getCurrentUser() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}

function getCurrentSkinIdFromInventory(inventory: ShopInventory) {
  return inventory.ownedSkinIds.find((skinId) => SKIN_OPTIONS.some((skin) => skin.id === skinId)) ?? DEFAULT_AVATAR_CUSTOMIZATION.skinId;
}

export async function loadInventoryForCurrentUser(currentSkinId?: number): Promise<InventoryLoadResult> {
  const localInventory = readLocalInventory(currentSkinId);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        inventory: localInventory,
        persistedToDatabase: false,
        usedLocalFallback: true
      };
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("owned_skin_ids, unopened_packs, card_collection")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return {
        inventory: localInventory,
        persistedToDatabase: false,
        usedLocalFallback: true,
        errorMessage: error.message
      };
    }

    const inventory = normalizeInventory(
      {
        ownedSkinIds: (data as { owned_skin_ids?: number[] | null } | null)?.owned_skin_ids ?? undefined,
        unopenedPacks: (data as { unopened_packs?: Record<string, number> | null } | null)?.unopened_packs ?? undefined,
        cardCollection: (data as { card_collection?: Record<string, number> | null } | null)?.card_collection ?? undefined
      },
      currentSkinId
    );

    writeLocalInventory(inventory);
    return {
      inventory,
      persistedToDatabase: true,
      usedLocalFallback: false
    };
  } catch (error) {
    return {
      inventory: localInventory,
      persistedToDatabase: false,
      usedLocalFallback: true,
      errorMessage: error instanceof Error ? error.message : "Could not load inventory."
    };
  }
}

export async function saveInventoryForCurrentUser(inventory: ShopInventory): Promise<InventorySaveResult> {
  const normalized = normalizeInventory(inventory, getCurrentSkinIdFromInventory(inventory));
  writeLocalInventory(normalized);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        inventory: normalized,
        persistedToDatabase: false
      };
    }

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        owned_skin_ids: normalized.ownedSkinIds,
        unopened_packs: normalized.unopenedPacks,
        card_collection: normalized.cardCollection
      },
      { onConflict: "id" }
    );

    return {
      inventory: normalized,
      persistedToDatabase: !error,
      errorMessage: error?.message
    };
  } catch (error) {
    return {
      inventory: normalized,
      persistedToDatabase: false,
      errorMessage: error instanceof Error ? error.message : "Could not save inventory."
    };
  }
}
