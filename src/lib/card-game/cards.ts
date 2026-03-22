import { EMBER_CARDS } from "./cardSets/emberCards";
import { IRON_CARDS } from "./cardSets/ironCards";
import { LUNAR_CARDS } from "./cardSets/lunarCards";
import { SKY_CARDS } from "./cardSets/skyCards";
import { STARTER_CARDS } from "./cardSets/starterCards";
import { TIDE_CARDS } from "./cardSets/tideCards";
import { WILD_CARDS } from "./cardSets/wildCards";
import type { CardDefinition, TrapCardDefinition, UnitCardDefinition } from "./types";

export const CARD_LIBRARY: CardDefinition[] = [
  ...STARTER_CARDS,
  ...SKY_CARDS,
  ...IRON_CARDS,
  ...WILD_CARDS,
  ...EMBER_CARDS,
  ...TIDE_CARDS,
  ...LUNAR_CARDS
];

export const CARD_INDEX = Object.fromEntries(CARD_LIBRARY.map((card) => [card.id, card])) as Record<
  string,
  CardDefinition
>;

export const isUnitCard = (card: CardDefinition): card is UnitCardDefinition => card.type === "unit";

export const isTrapCard = (card: CardDefinition): card is TrapCardDefinition => card.type === "trap";

export const getCardById = (cardId: string): CardDefinition => CARD_INDEX[cardId];
