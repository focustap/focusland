import { CARD_INDEX } from "./cards";
import { STARTER_DECK } from "./decks";

export const MAX_DECK_SIZE = 30;
export const MAX_COPIES_PER_CARD = 2;
export const DECK_SLOT_COUNT = 6;
export const LOCAL_DECK_STORAGE_KEY = "focusland-card-decks-v3";

export type DeckCounts = Record<string, number>;

export type SavedDeckSlot = {
  id: string;
  name: string;
  cardIds: string[];
};

export type DeckPreset = {
  id: string;
  name: string;
  description: string;
  cardIds: string[];
};

export type StoredDeckState = {
  slots: SavedDeckSlot[];
  activeSlotId: string;
};

const SLOT_IDS = ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"] as const;

const createDeckList = (cardIds: string[]) => sanitizeDeckList(cardIds);

export const DECK_PRESETS: DeckPreset[] = [
  {
    id: "starter-balance",
    name: "Starter Balance",
    description: "Starter-only list with anti-air, healing, buffs, and spell tax.",
    cardIds: createDeckList(STARTER_DECK)
  },
  {
    id: "sky-rush",
    name: "Sky Rush",
    description: "Flying pressure backed by ranged support and tempo bounce.",
    cardIds: createDeckList([
      "cloud-skirmisher", "cloud-skirmisher", "windstep-ranger", "windstep-ranger", "thunderwing-ace", "thunderwing-ace",
      "skyglass-spotter", "skyglass-spotter", "gale-sentinel", "gale-sentinel", "horizon-spearhawk", "horizon-spearhawk",
      "cirrus-raider", "cirrus-raider", "tailwind-charge", "tailwind-charge", "pinion-volley", "pinion-volley",
      "updraft-blessing", "updraft-blessing", "clean-break", "clean-break", "storm-tariff", "storm-tariff",
      "watchtower-archer", "watchtower-archer", "gale-falcon", "gale-falcon", "null-sigil", "null-sigil"
    ])
  },
  {
    id: "iron-fortress",
    name: "Iron Fortress",
    description: "Guard-heavy control deck with repair tools and heavy blockers.",
    cardIds: createDeckList([
      "iron-guard", "iron-guard", "trench-sentinel", "trench-sentinel", "pike-engineer", "pike-engineer",
      "bastion-smith", "bastion-smith", "banner-captain", "banner-captain", "clockbolt-sniper", "clockbolt-sniper",
      "steelclad-rhino", "steelclad-rhino", "bulwark-titan", "bulwark-titan", "repair-order", "repair-order",
      "shield-march", "shield-march", "hammer-fall", "hammer-fall", "recall-to-arms", "recall-to-arms",
      "counterweight", "counterweight", "stone-warden", "stone-warden", "watchtower-archer", "watchtower-archer"
    ])
  },
  {
    id: "wild-root",
    name: "Wild Root",
    description: "Sticky board deck with guard bodies, stealth threats, and reclaim spells.",
    cardIds: createDeckList([
      "canopy-stalker", "canopy-stalker", "thorn-archer", "thorn-archer", "seed-carrier", "seed-carrier",
      "savage-sapling", "savage-sapling", "moss-howler", "moss-howler", "rot-bloom-witch", "rot-bloom-witch",
      "briar-guardian", "briar-guardian", "vineback-giant", "vineback-giant", "forest-call", "forest-call",
      "root-snag", "root-snag", "rebloom", "rebloom", "sap-surge", "sap-surge",
      "thorn-barricade", "thorn-barricade", "watchtower-archer", "watchtower-archer", "anchor-flip", "anchor-flip"
    ])
  },
  {
    id: "ember-blitz",
    name: "Ember Blitz",
    description: "Fast burn deck that still carries ranged answers and some spell tax.",
    cardIds: createDeckList([
      "cinder-runner", "cinder-runner", "ash-hexer", "ash-hexer", "flare-priest", "flare-priest",
      "blaze-raider", "blaze-raider", "ember-duelist", "ember-duelist", "furnace-drake", "furnace-drake",
      "pyre-hound", "pyre-hound", "smokestack-ogre", "smokestack-ogre", "flash-fuel", "flash-fuel",
      "spark-burst", "spark-burst", "ember-shot", "ember-shot", "scorchtip", "scorchtip",
      "rally-the-flame", "rally-the-flame", "wildfire-ring", "wildfire-ring", "ember-levy", "ember-levy"
    ])
  },
  {
    id: "tide-moon",
    name: "Tide Moon",
    description: "Draw, bounce, and anti-air control with efficient spell-tax backup.",
    cardIds: createDeckList([
      "mist-channeler", "mist-channeler", "harbor-turtle", "harbor-turtle", "pearl-diver", "pearl-diver",
      "undertow-mage", "undertow-mage", "moonshot-arcanist", "moonshot-arcanist", "eclipse-sage", "eclipse-sage",
      "flood-drake", "flood-drake", "starweaver", "starweaver", "undertow", "undertow",
      "tidal-focus", "tidal-focus", "foresight", "foresight", "freeze-current", "freeze-current",
      "moonwell", "moonwell", "starfall", "starfall", "mana-lattice", "mana-lattice"
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

export function limitDeckListToCollection(cardIds: string[], collection: Record<string, number>) {
  const usedCounts: Record<string, number> = {};
  const limited: string[] = [];

  for (const cardId of sanitizeDeckList(cardIds)) {
    const ownedCount = Math.max(0, Math.floor(collection[cardId] ?? 0));
    if ((usedCounts[cardId] ?? 0) >= ownedCount) {
      continue;
    }

    usedCounts[cardId] = (usedCounts[cardId] ?? 0) + 1;
    limited.push(cardId);
  }

  return limited;
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
    slots: SLOT_IDS.map((slotId, index) => ({
      id: slotId,
      name: `My Deck ${index + 1}`,
      cardIds: [...(DECK_PRESETS[index]?.cardIds ?? STARTER_DECK)]
    })),
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
