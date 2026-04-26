import type { CampfireCardPack } from "./packs";

export const IMPORTED_PARTY_PACK_SOURCE =
  "No imported cards are bundled yet. The requested Google Sheet is a Cards Against Humanity sheet with commercial card text, so it is not safe to copy into this project.";

export const IMPORTED_PARTY_PACK: CampfireCardPack = {
  id: "imported-party",
  name: "Imported Party Pack",
  description: "Default-off slot for a future CSV of original or permissively licensed one-answer party cards.",
  prompts: [],
  answers: []
};
