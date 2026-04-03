export type ZombTrainView = "title" | "map" | "train" | "fishing";

export type ZombTrainDestinationId =
  | "stillwater-pond"
  | "pinewatch-woods"
  | "iron-hollow"
  | "sunset-market";

export type ZombTrainResourceKey =
  | "coins"
  | "bait"
  | "fish"
  | "wood"
  | "ore"
  | "scrap"
  | "herbs";

export type ZombTrainTrainPalette = "ember" | "sage" | "cream" | "night";

export type ZombTrainTrainUpgradeKey = "stove" | "storage" | "workbench" | "lanterns";
export type ZombTrainFishRarity = "common" | "uncommon" | "rare" | "legendary";
export type ZombTrainFishId =
  | "glassfin-carp"
  | "softshell-bluegill"
  | "lantern-koi"
  | "moon-eel";

export type ZombTrainDestination = {
  id: ZombTrainDestinationId;
  name: string;
  vibe: string;
  risk: "Low" | "Medium" | "High";
  travelTime: string;
  featuredResource: ZombTrainResourceKey;
  fishName?: string;
  forageYield: Partial<Record<ZombTrainResourceKey, number>>;
  mineYield?: Partial<Record<ZombTrainResourceKey, number>>;
  sellBonus?: number;
};

export type ZombTrainTrainState = {
  palette: ZombTrainTrainPalette;
  lanternGlow: number;
  plantCount: number;
  quiltPattern: "patchwork" | "stripe" | "wildflower";
};

export type ZombTrainUpgrade = {
  key: ZombTrainTrainUpgradeKey;
  name: string;
  description: string;
  cost: number;
};

export type ZombTrainFishDefinition = {
  id: ZombTrainFishId;
  name: string;
  rarity: ZombTrainFishRarity;
  value: number;
  difficulty: number;
  barSize: number;
  speed: number;
  destinationId: ZombTrainDestinationId;
};

export type ZombTrainSave = {
  activeView: ZombTrainView;
  selectedDestinationId: ZombTrainDestinationId;
  currentStopId: ZombTrainDestinationId;
  day: number;
  cozyMeter: number;
  dangerMeter: number;
  inventory: Record<ZombTrainResourceKey, number>;
  train: ZombTrainTrainState;
  upgrades: ZombTrainTrainUpgradeKey[];
  fishInventory: Record<ZombTrainFishId, number>;
  journal: string[];
  lastUpdatedAt: string;
};

export const ZOMBTRAIN_STORAGE_KEY = "focusland-zombtrain-save";

export const ZOMBTRAIN_DESTINATIONS: ZombTrainDestination[] = [
  {
    id: "stillwater-pond",
    name: "Stillwater Pond",
    vibe: "Foggy fishing stop with cattails, lily pads, and the quiet kind of danger.",
    risk: "Low",
    travelTime: "Morning run",
    featuredResource: "fish",
    fishName: "Glassfin carp",
    forageYield: { herbs: 2, bait: 1 },
    sellBonus: 1.05
  },
  {
    id: "pinewatch-woods",
    name: "Pinewatch Woods",
    vibe: "Cozy forest edge full of soft moss, timber, and salvageable camp supplies.",
    risk: "Low",
    travelTime: "Short route",
    featuredResource: "wood",
    fishName: "Needle creek trout",
    forageYield: { wood: 4, herbs: 1, bait: 1 }
  },
  {
    id: "iron-hollow",
    name: "Iron Hollow",
    vibe: "Collapsed quarry with rich ore veins and more zombie pressure after sunset.",
    risk: "Medium",
    travelTime: "Half-day haul",
    featuredResource: "ore",
    forageYield: { scrap: 3, ore: 2 },
    mineYield: { ore: 5, scrap: 2 }
  },
  {
    id: "sunset-market",
    name: "Sunset Market",
    vibe: "A lantern-lit survivor bazaar where your sell box turns finds into real upgrades.",
    risk: "Low",
    travelTime: "Evening loop",
    featuredResource: "coins",
    forageYield: { coins: 10 },
    sellBonus: 1.2
  }
];

export const ZOMBTRAIN_UPGRADES: ZombTrainUpgrade[] = [
  {
    key: "stove",
    name: "Tea Stove",
    description: "Raises the cozy baseline and makes the cabin feel lived in.",
    cost: 45
  },
  {
    key: "storage",
    name: "Crate Wall",
    description: "More room for fish, lumber, and salvage between stops.",
    cost: 55
  },
  {
    key: "workbench",
    name: "Repair Bench",
    description: "Lets you turn scrap into stronger tools down the line.",
    cost: 70
  },
  {
    key: "lanterns",
    name: "Warm Lantern Set",
    description: "A cosmetic upgrade that makes every stop feel safer.",
    cost: 35
  }
];

export const ZOMBTRAIN_FISH: ZombTrainFishDefinition[] = [
  {
    id: "softshell-bluegill",
    name: "Softshell Bluegill",
    rarity: "common",
    value: 14,
    difficulty: 1,
    barSize: 84,
    speed: 0.9,
    destinationId: "stillwater-pond"
  },
  {
    id: "glassfin-carp",
    name: "Glassfin Carp",
    rarity: "uncommon",
    value: 24,
    difficulty: 2,
    barSize: 64,
    speed: 1.15,
    destinationId: "stillwater-pond"
  },
  {
    id: "lantern-koi",
    name: "Lantern Koi",
    rarity: "rare",
    value: 46,
    difficulty: 3,
    barSize: 48,
    speed: 1.35,
    destinationId: "stillwater-pond"
  },
  {
    id: "moon-eel",
    name: "Moon Eel",
    rarity: "legendary",
    value: 92,
    difficulty: 4,
    barSize: 34,
    speed: 1.6,
    destinationId: "stillwater-pond"
  }
];

export const DEFAULT_ZOMBTRAIN_SAVE: ZombTrainSave = {
  activeView: "title",
  selectedDestinationId: "stillwater-pond",
  currentStopId: "stillwater-pond",
  day: 1,
  cozyMeter: 74,
  dangerMeter: 18,
  inventory: {
    coins: 32,
    bait: 6,
    fish: 0,
    wood: 5,
    ore: 1,
    scrap: 4,
    herbs: 3
  },
  train: {
    palette: "sage",
    lanternGlow: 68,
    plantCount: 2,
    quiltPattern: "patchwork"
  },
  upgrades: [],
  fishInventory: {
    "glassfin-carp": 0,
    "softshell-bluegill": 0,
    "lantern-koi": 0,
    "moon-eel": 0
  },
  journal: [
    "The old world is gone, but the kettle still whistles.",
    "People pay well for calm places, fresh fish, and working lanterns."
  ],
  lastUpdatedAt: new Date().toISOString()
};

export function loadZombTrainSave() {
  if (typeof window === "undefined") {
    return DEFAULT_ZOMBTRAIN_SAVE;
  }

  try {
    const raw = window.localStorage.getItem(ZOMBTRAIN_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_ZOMBTRAIN_SAVE;
    }

    const parsed = JSON.parse(raw) as Partial<ZombTrainSave>;
    return normalizeZombTrainSave(parsed);
  } catch {
    return DEFAULT_ZOMBTRAIN_SAVE;
  }
}

export function saveZombTrainSave(value: ZombTrainSave) {
  if (typeof window === "undefined") {
    return value;
  }

  const normalized = normalizeZombTrainSave({
    ...value,
    lastUpdatedAt: new Date().toISOString()
  });
  window.localStorage.setItem(ZOMBTRAIN_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetZombTrainSave() {
  return saveZombTrainSave(DEFAULT_ZOMBTRAIN_SAVE);
}

export function getDestinationById(id: ZombTrainDestinationId) {
  return ZOMBTRAIN_DESTINATIONS.find((destination) => destination.id === id) ?? ZOMBTRAIN_DESTINATIONS[0];
}

export function formatResourceLabel(resource: ZombTrainResourceKey) {
  switch (resource) {
    case "coins":
      return "Coins";
    case "bait":
      return "Bait";
    case "fish":
      return "Fish";
    case "wood":
      return "Wood";
    case "ore":
      return "Ore";
    case "scrap":
      return "Scrap";
    case "herbs":
      return "Herbs";
    default:
      return resource;
  }
}

export function getPalettePreview(palette: ZombTrainTrainPalette) {
  switch (palette) {
    case "ember":
      return { shell: "#8f3f2d", trim: "#f4d6a0" };
    case "sage":
      return { shell: "#5f7e65", trim: "#efe5c6" };
    case "cream":
      return { shell: "#d9c6a5", trim: "#6a4b32" };
    case "night":
      return { shell: "#2f3c59", trim: "#d5d8f0" };
    default:
      return { shell: "#5f7e65", trim: "#efe5c6" };
  }
}

function normalizeInventory(
  value: Partial<Record<ZombTrainResourceKey, number>> | undefined
): Record<ZombTrainResourceKey, number> {
  return {
    coins: clampCount(value?.coins, DEFAULT_ZOMBTRAIN_SAVE.inventory.coins),
    bait: clampCount(value?.bait, DEFAULT_ZOMBTRAIN_SAVE.inventory.bait),
    fish: clampCount(value?.fish, DEFAULT_ZOMBTRAIN_SAVE.inventory.fish),
    wood: clampCount(value?.wood, DEFAULT_ZOMBTRAIN_SAVE.inventory.wood),
    ore: clampCount(value?.ore, DEFAULT_ZOMBTRAIN_SAVE.inventory.ore),
    scrap: clampCount(value?.scrap, DEFAULT_ZOMBTRAIN_SAVE.inventory.scrap),
    herbs: clampCount(value?.herbs, DEFAULT_ZOMBTRAIN_SAVE.inventory.herbs)
  };
}

function normalizeZombTrainSave(value: Partial<ZombTrainSave>): ZombTrainSave {
  const selectedDestination = getDestinationById(
    (value.selectedDestinationId as ZombTrainDestinationId | undefined) ?? DEFAULT_ZOMBTRAIN_SAVE.selectedDestinationId
  );
  const currentStop = getDestinationById(
    (value.currentStopId as ZombTrainDestinationId | undefined) ?? DEFAULT_ZOMBTRAIN_SAVE.currentStopId
  );

  return {
    activeView:
      value.activeView === "map" || value.activeView === "train" || value.activeView === "fishing"
        ? value.activeView
        : "title",
    selectedDestinationId: selectedDestination.id,
    currentStopId: currentStop.id,
    day: clampCount(value.day, DEFAULT_ZOMBTRAIN_SAVE.day, 1),
    cozyMeter: clampCount(value.cozyMeter, DEFAULT_ZOMBTRAIN_SAVE.cozyMeter, 0, 100),
    dangerMeter: clampCount(value.dangerMeter, DEFAULT_ZOMBTRAIN_SAVE.dangerMeter, 0, 100),
    inventory: normalizeInventory(value.inventory),
    train: {
      palette: normalizePalette(value.train?.palette),
      lanternGlow: clampCount(value.train?.lanternGlow, DEFAULT_ZOMBTRAIN_SAVE.train.lanternGlow, 20, 100),
      plantCount: clampCount(value.train?.plantCount, DEFAULT_ZOMBTRAIN_SAVE.train.plantCount, 0, 6),
      quiltPattern: normalizeQuiltPattern(value.train?.quiltPattern)
    },
    upgrades: Array.isArray(value.upgrades)
      ? value.upgrades.filter((upgrade): upgrade is ZombTrainTrainUpgradeKey =>
          ZOMBTRAIN_UPGRADES.some((item) => item.key === upgrade)
        )
      : [],
    fishInventory: normalizeFishInventory(value.fishInventory),
    journal: Array.isArray(value.journal) && value.journal.length > 0
      ? value.journal.slice(0, 12)
      : DEFAULT_ZOMBTRAIN_SAVE.journal,
    lastUpdatedAt: typeof value.lastUpdatedAt === "string" ? value.lastUpdatedAt : new Date().toISOString()
  };
}

function normalizeFishInventory(
  value: Partial<Record<ZombTrainFishId, number>> | undefined
): Record<ZombTrainFishId, number> {
  return {
    "glassfin-carp": clampCount(value?.["glassfin-carp"], DEFAULT_ZOMBTRAIN_SAVE.fishInventory["glassfin-carp"]),
    "softshell-bluegill": clampCount(value?.["softshell-bluegill"], DEFAULT_ZOMBTRAIN_SAVE.fishInventory["softshell-bluegill"]),
    "lantern-koi": clampCount(value?.["lantern-koi"], DEFAULT_ZOMBTRAIN_SAVE.fishInventory["lantern-koi"]),
    "moon-eel": clampCount(value?.["moon-eel"], DEFAULT_ZOMBTRAIN_SAVE.fishInventory["moon-eel"])
  };
}

export function getFishByDestination(destinationId: ZombTrainDestinationId) {
  return ZOMBTRAIN_FISH.filter((fish) => fish.destinationId === destinationId);
}

export function getFishById(id: ZombTrainFishId) {
  return ZOMBTRAIN_FISH.find((fish) => fish.id === id) ?? ZOMBTRAIN_FISH[0];
}

export function formatFishRarity(rarity: ZombTrainFishRarity) {
  switch (rarity) {
    case "common":
      return "Common";
    case "uncommon":
      return "Uncommon";
    case "rare":
      return "Rare";
    case "legendary":
      return "Legendary";
    default:
      return rarity;
  }
}

function clampCount(value: number | undefined, fallback: number, min = 0, max = 999) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizePalette(value: ZombTrainTrainPalette | undefined): ZombTrainTrainPalette {
  switch (value) {
    case "ember":
    case "sage":
    case "cream":
    case "night":
      return value;
    default:
      return DEFAULT_ZOMBTRAIN_SAVE.train.palette;
  }
}

function normalizeQuiltPattern(
  value: ZombTrainTrainState["quiltPattern"] | undefined
): ZombTrainTrainState["quiltPattern"] {
  switch (value) {
    case "patchwork":
    case "stripe":
    case "wildflower":
      return value;
    default:
      return DEFAULT_ZOMBTRAIN_SAVE.train.quiltPattern;
  }
}
