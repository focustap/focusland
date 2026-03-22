import { CARD_INDEX } from "./cards";
import { STARTER_DECK } from "./decks";

export const MAX_DECK_SIZE = 30;
export const MAX_COPIES_PER_CARD = 2;
export const DECK_SLOT_COUNT = 3;
export const LOCAL_DECK_STORAGE_KEY = "focusland-card-decks-v2";

export type DeckCounts = Record<string, number>;

export type SavedDeckSlot = {
  id: string;
  name: string;
  cardIds: string[];
};

export type StoredDeckState = {
  slots: SavedDeckSlot[];
  activeSlotId: string;
};

const SLOT_IDS = ["slot-1", "slot-2", "slot-3"] as const;

const createDeckList = (cardIds: string[]) => sanitizeDeckList(cardIds);

export const DECK_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  cardIds: string[];
}> = [
  {
    id: "starter-balance",
    name: "Starter Balance",
    description: "Steady curve with removal, draw, and a few trap checks.",
    cardIds: createDeckList([
      "spark-scout",
      "spark-scout",
      "iron-guard",
      "iron-guard",
      "dusk-duelist",
      "dusk-duelist",
      "vine-lurker",
      "vine-lurker",
      "river-serpent",
      "river-serpent",
      "lunar-mage",
      "lunar-mage",
      "storm-rider",
      "storm-rider",
      "siege-golem",
      "siege-golem",
      "ember-shot",
      "ember-shot",
      "tactical-insight",
      "tactical-insight",
      "river-mist",
      "river-mist",
      "flame-sweep",
      "flame-sweep",
      "ambush-snare",
      "ambush-snare",
      "spellwire",
      "spellwire",
      "spark-burst",
      "spark-burst"
    ])
  },
  {
    id: "sky-rush",
    name: "Sky Rush",
    description: "Fast pressure deck built around flying and swift attackers.",
    cardIds: createDeckList([
      "spark-scout",
      "spark-scout",
      "dawn-courier",
      "dawn-courier",
      "gale-falcon",
      "gale-falcon",
      "bronze-charger",
      "bronze-charger",
      "dusk-duelist",
      "dusk-duelist",
      "sky-drake",
      "sky-drake",
      "storm-rider",
      "storm-rider",
      "ember-shot",
      "ember-shot",
      "spark-burst",
      "spark-burst",
      "tactical-insight",
      "tactical-insight",
      "river-mist",
      "river-mist",
      "flame-sweep",
      "flame-sweep",
      "ambush-snare",
      "ambush-snare",
      "mirror-rune",
      "mirror-rune",
      "spellwire",
      "spellwire"
    ])
  },
  {
    id: "stone-vine-lock",
    name: "Stone Vine Lock",
    description: "Bulkier units and sticky traps for slower board control.",
    cardIds: createDeckList([
      "iron-guard",
      "iron-guard",
      "vine-lurker",
      "vine-lurker",
      "lunar-mage",
      "lunar-mage",
      "river-serpent",
      "river-serpent",
      "siege-golem",
      "siege-golem",
      "stone-warden",
      "stone-warden",
      "ember-shot",
      "ember-shot",
      "tactical-insight",
      "tactical-insight",
      "river-mist",
      "river-mist",
      "storm-surge",
      "storm-surge",
      "flame-sweep",
      "flame-sweep",
      "ambush-snare",
      "ambush-snare",
      "bramble-pit",
      "bramble-pit",
      "mirror-rune",
      "mirror-rune",
      "spellwire",
      "spellwire"
    ])
  }
];

export function sanitizeDeckList(cardIds: string[]) {
  const copyCounts: Record<string, number> = {};
  const sanitized: string[] = [];

  for (const cardId of cardIds) {
    if (!CARD_INDEX[cardId]) {
      continue;
    }

    if ((copyCounts[cardId] ?? 0) >= MAX_COPIES_PER_CARD) {
      continue;
    }

    if (sanitized.length >= MAX_DECK_SIZE) {
      break;
    }

    copyCounts[cardId] = (copyCounts[cardId] ?? 0) + 1;
    sanitized.push(cardId);
  }

  return sanitized;
}

export function deckListToCounts(cardIds: string[]): DeckCounts {
  return sanitizeDeckList(cardIds).reduce<DeckCounts>((counts, cardId) => {
    counts[cardId] = (counts[cardId] ?? 0) + 1;
    return counts;
  }, {});
}

export function countsToDeckList(counts: DeckCounts): string[] {
  const deckList: string[] = [];

  Object.entries(counts).forEach(([cardId, count]) => {
    const safeCount = Math.min(MAX_COPIES_PER_CARD, Math.max(0, count));

    for (let index = 0; index < safeCount; index += 1) {
      deckList.push(cardId);
    }
  });

  return sanitizeDeckList(deckList);
}

export function getDeckSummary(counts: DeckCounts) {
  const totalCards = Object.values(counts).reduce((total, count) => total + count, 0);
  const overLimit = totalCards > MAX_DECK_SIZE;
  const tooManyCopies = Object.values(counts).some((count) => count > MAX_COPIES_PER_CARD);

  return {
    totalCards,
    isValid: totalCards <= MAX_DECK_SIZE && !tooManyCopies && totalCards > 0,
    overLimit,
    tooManyCopies
  };
}

export function createDefaultDeckState(): StoredDeckState {
  return {
    slots: SLOT_IDS.map((slotId, index) => {
      const preset = DECK_PRESETS[index] ?? DECK_PRESETS[0];
      return {
        id: slotId,
        name: preset.name,
        cardIds: [...preset.cardIds]
      };
    }),
    activeSlotId: SLOT_IDS[0]
  };
}

export function readLocalDeckState(): StoredDeckState {
  if (typeof window === "undefined") {
    return createDefaultDeckState();
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_DECK_STORAGE_KEY);
    if (!raw) {
      return createDefaultDeckState();
    }

    const parsed = JSON.parse(raw) as Partial<StoredDeckState>;
    const defaultState = createDefaultDeckState();
    const slots = defaultState.slots.map((slot) => {
      const incoming = parsed.slots?.find((item) => item.id === slot.id);
      return {
        id: slot.id,
        name: incoming?.name?.trim() || slot.name,
        cardIds: sanitizeDeckList(incoming?.cardIds ?? slot.cardIds)
      };
    });

    const activeSlotId = slots.some((slot) => slot.id === parsed.activeSlotId)
      ? (parsed.activeSlotId as string)
      : defaultState.activeSlotId;

    return {
      slots,
      activeSlotId
    };
  } catch {
    return createDefaultDeckState();
  }
}

export function writeLocalDeckState(state: StoredDeckState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOCAL_DECK_STORAGE_KEY,
    JSON.stringify({
      slots: state.slots.map((slot) => ({
        ...slot,
        cardIds: sanitizeDeckList(slot.cardIds)
      })),
      activeSlotId: state.activeSlotId
    })
  );
}

export function getActiveDeckList(state: StoredDeckState) {
  const activeSlot = state.slots.find((slot) => slot.id === state.activeSlotId) ?? state.slots[0];
  return sanitizeDeckList(activeSlot?.cardIds ?? STARTER_DECK);
}
