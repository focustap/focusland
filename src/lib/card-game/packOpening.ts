import { CARD_LIBRARY } from "./cards";
import type { CardDefinition } from "./types";
import { SHOP_PACK_PRODUCTS } from "../shop";

export type CardRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type PackRevealCard = {
  cardId: string;
  rarity: CardRarity;
  isFoil: boolean;
};

const RARITY_WEIGHTS: Record<CardRarity, number> = {
  common: 55,
  uncommon: 27,
  rare: 12,
  epic: 5,
  legendary: 1
};

const RARITY_ORDER: CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

const RARITY_OVERRIDES: Partial<Record<string, CardRarity>> = {
  "siege-golem": "legendary",
  "bulwark-titan": "legendary",
  "vineback-giant": "legendary",
  "smokestack-ogre": "epic",
  "furnace-drake": "epic",
  "starweaver": "legendary",
  "eclipse-sage": "epic",
  "flood-drake": "epic",
  "wildfire-ring": "rare",
  "moonwell": "rare",
  "ember-levy": "epic",
  "null-sigil": "rare",
  "storm-surge": "epic",
  "stone-warden": "epic",
  "sky-drake": "rare",
  "gale-sentinel": "rare",
  "thunderwing-ace": "epic",
  "steelclad-rhino": "rare",
  "recall-to-arms": "rare"
};

function seededRandom(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function weightedChoice<T>(choices: Array<{ value: T; weight: number }>, random: number) {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let cursor = random * total;

  for (const choice of choices) {
    cursor -= choice.weight;
    if (cursor <= 0) {
      return choice.value;
    }
  }

  return choices[choices.length - 1]?.value;
}

export function getCardRarity(card: CardDefinition): CardRarity {
  const override = RARITY_OVERRIDES[card.id];
  if (override) {
    return override;
  }

  if (card.family === "starter") {
    if (card.cost <= 2) return "common";
    if (card.cost === 3) return "uncommon";
    if (card.cost === 4) return "rare";
    return "epic";
  }

  if (card.cost <= 1) return "common";
  if (card.cost === 2) return "uncommon";
  if (card.cost === 3) return card.type === "trap" ? "rare" : "uncommon";
  if (card.cost === 4) return "rare";
  if (card.cost === 5) return "epic";
  return "legendary";
}

export function getRarityColor(rarity: CardRarity) {
  switch (rarity) {
    case "common":
      return "#cbd5e1";
    case "uncommon":
      return "#86efac";
    case "rare":
      return "#7dd3fc";
    case "epic":
      return "#c084fc";
    case "legendary":
      return "#fbbf24";
  }
}

function getCardsForPack() {
  return CARD_LIBRARY.filter((card) => card.family !== "starter");
}

function getCardsByMinimumRarity(cards: CardDefinition[], rarity: CardRarity) {
  const minimumIndex = RARITY_ORDER.indexOf(rarity);
  return cards.filter((card) => RARITY_ORDER.indexOf(getCardRarity(card)) >= minimumIndex);
}

function getCardsByExactRarity(cards: CardDefinition[], rarity: CardRarity) {
  return cards.filter((card) => getCardRarity(card) === rarity);
}

function pickCard(cards: CardDefinition[], seedBase: number, rarity: CardRarity) {
  const exact = getCardsByExactRarity(cards, rarity);
  const pool = exact.length > 0 ? exact : getCardsByMinimumRarity(cards, rarity);
  const index = Math.floor(seededRandom(seedBase) * pool.length);
  return pool[Math.max(0, Math.min(pool.length - 1, index))];
}

export function openPack(packId: string, seed: number = Date.now()): PackRevealCard[] {
  const pack = SHOP_PACK_PRODUCTS.find((product) => product.id === packId);
  const cards = getCardsForPack();
  const slotRarities: CardRarity[] = (pack?.raritySlots ?? []).map((slotWeights, index) =>
    weightedChoice(
      RARITY_ORDER.map((rarity) => ({ value: rarity, weight: slotWeights[rarity] ?? RARITY_WEIGHTS[rarity] })),
      seededRandom(seed + index + 1)
    )
  );

  if (slotRarities.length === 0) {
    slotRarities.push("common", "uncommon", "rare", "epic", "legendary");
  }

  return slotRarities.map((rarity, index) => {
    const card = pickCard(cards, seed + 11 * (index + 1), rarity);
    return {
      cardId: card.id,
      rarity: getCardRarity(card),
      isFoil: index === slotRarities.length - 1 ? seededRandom(seed + 90) > 0.56 : seededRandom(seed + 60 + index) > 0.92
    };
  });
}
