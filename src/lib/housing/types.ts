export type HousingItemCategory =
  | "arcade"
  | "decor"
  | "floor"
  | "light"
  | "seating"
  | "storage"
  | "table";

export type HousingItemId =
  | "arcade_machine"
  | "bookshelf"
  | "couch"
  | "potted_plant"
  | "rug"
  | "small_round_table"
  | "standing_lamp"
  | "wooden_chair";

export type HousingItemDefinition = {
  id: HousingItemId;
  name: string;
  category: HousingItemCategory;
  footprint: {
    width: number;
    height: number;
  };
  imageUrl: string;
};

export type PlacedHousingItem = {
  instanceId: string;
  itemId: HousingItemId;
  x: number;
  y: number;
};

