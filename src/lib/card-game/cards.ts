import type { CardDefinition, TrapCardDefinition, UnitCardDefinition } from "./types";

export const CARD_LIBRARY: CardDefinition[] = [
  {
    id: "spark-scout",
    name: "Spark Scout",
    type: "unit",
    cost: 1,
    attack: 1,
    health: 2,
    text: "A cheap opener that helps contest the board early."
  },
  {
    id: "iron-guard",
    name: "Iron Guard",
    type: "unit",
    cost: 2,
    attack: 2,
    health: 3,
    text: "Solid early defender."
  },
  {
    id: "dusk-duelist",
    name: "Dusk Duelist",
    type: "unit",
    cost: 3,
    attack: 4,
    health: 2,
    text: "Hits hard, but trades easily."
  },
  {
    id: "river-serpent",
    name: "River Serpent",
    type: "unit",
    cost: 4,
    attack: 4,
    health: 4,
    text: "A clean midgame threat."
  },
  {
    id: "siege-golem",
    name: "Siege Golem",
    type: "unit",
    cost: 6,
    attack: 6,
    health: 6,
    text: "A slow finisher that dominates empty boards."
  },
  {
    id: "ember-shot",
    name: "Ember Shot",
    type: "spell",
    cost: 2,
    text: "Deal 3 damage to the enemy hero.",
    effects: [
      {
        kind: "damage-hero",
        amount: 3,
        target: "enemy"
      }
    ]
  },
  {
    id: "tactical-insight",
    name: "Tactical Insight",
    type: "spell",
    cost: 2,
    text: "Draw 2 cards.",
    effects: [
      {
        kind: "draw",
        amount: 2,
        target: "self"
      }
    ]
  },
  {
    id: "flame-sweep",
    name: "Flame Sweep",
    type: "spell",
    cost: 4,
    text: "Deal 2 damage to all enemy units.",
    effects: [
      {
        kind: "damage-units",
        amount: 2,
        side: "enemy"
      }
    ]
  },
  {
    id: "ambush-snare",
    name: "Ambush Snare",
    type: "trap",
    cost: 2,
    text: "When an enemy unit attacks, destroy that attacker and cancel the attack.",
    trigger: "enemy-attack",
    effect: {
      kind: "destroy-attacker",
      cancelAttack: true
    }
  },
  {
    id: "spellwire",
    name: "Spellwire",
    type: "trap",
    cost: 2,
    text: "When your opponent casts a spell, deal 3 damage to that player.",
    trigger: "enemy-spell",
    effect: {
      kind: "damage-spell-owner",
      amount: 3
    }
  }
];

export const CARD_INDEX = Object.fromEntries(CARD_LIBRARY.map((card) => [card.id, card])) as Record<
  string,
  CardDefinition
>;

export const isUnitCard = (card: CardDefinition): card is UnitCardDefinition => card.type === "unit";

export const isTrapCard = (card: CardDefinition): card is TrapCardDefinition => card.type === "trap";

export const getCardById = (cardId: string): CardDefinition => CARD_INDEX[cardId];
