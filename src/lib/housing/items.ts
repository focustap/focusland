import type { HousingItemDefinition, HousingItemId } from "./types";

const furnitureAssetUrl = (filename: string) =>
  new URL(`../../../assets/furniture/${filename}`, import.meta.url).href;

export const HOUSE_TILE_SIZE = 48;
export const HOUSE_GRID_COLUMNS = 12;
export const HOUSE_GRID_ROWS = 7;
export const HOUSE_LAYOUT_STORAGE_KEY = "focusland_house_layout_v1";

export const HOUSING_ITEMS: HousingItemDefinition[] = [
  {
    id: "wooden_chair",
    name: "Wooden Chair",
    footprint: { width: 1, height: 1 },
    category: "seating",
    imageUrl: furnitureAssetUrl("wooden_chair.png")
  },
  {
    id: "small_round_table",
    name: "Small Round Table",
    footprint: { width: 2, height: 1 },
    category: "table",
    imageUrl: furnitureAssetUrl("small_round_table.png")
  },
  {
    id: "bookshelf",
    name: "Bookshelf",
    footprint: { width: 2, height: 1 },
    category: "storage",
    imageUrl: furnitureAssetUrl("bookshelf.png")
  },
  {
    id: "standing_lamp",
    name: "Standing Lamp",
    footprint: { width: 1, height: 1 },
    category: "light",
    imageUrl: furnitureAssetUrl("standing_lamp.png")
  },
  {
    id: "arcade_machine",
    name: "Arcade Machine",
    footprint: { width: 1, height: 1 },
    category: "arcade",
    imageUrl: furnitureAssetUrl("arcade_machine.png")
  },
  {
    id: "couch",
    name: "Couch",
    footprint: { width: 2, height: 1 },
    category: "seating",
    imageUrl: furnitureAssetUrl("couch.png")
  },
  {
    id: "rug",
    name: "Rug",
    footprint: { width: 2, height: 2 },
    category: "floor",
    imageUrl: furnitureAssetUrl("rug.png")
  },
  {
    id: "potted_plant",
    name: "Potted Plant",
    footprint: { width: 1, height: 1 },
    category: "decor",
    imageUrl: furnitureAssetUrl("potted_plant.png")
  }
];

export const HOUSING_ITEM_BY_ID: Record<HousingItemId, HousingItemDefinition> =
  HOUSING_ITEMS.reduce(
    (itemsById, item) => ({
      ...itemsById,
      [item.id]: item
    }),
    {} as Record<HousingItemId, HousingItemDefinition>
  );

