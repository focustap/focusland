import type { CardDefinition, TrapCardDefinition, UnitCardDefinition } from "./types";

export const CARD_LIBRARY: CardDefinition[] = [
  {
    id: "spark-scout",
    name: "Spark Scout",
    type: "unit",
    cost: 1,
    attack: 1,
    health: 2,
    text: "A cheap opener that helps contest the board early.",
    artLabel: "Scout",
    visualTheme: "spark"
  },
  {
    id: "iron-guard",
    name: "Iron Guard",
    type: "unit",
    cost: 2,
    attack: 2,
    health: 3,
    text: "Solid early defender.",
    artLabel: "Guard",
    visualTheme: "iron"
  },
  {
    id: "dusk-duelist",
    name: "Dusk Duelist",
    type: "unit",
    cost: 3,
    attack: 4,
    health: 2,
    text: "Hits hard, but trades easily.",
    artLabel: "Blade",
    visualTheme: "dusk"
  },
  {
    id: "river-serpent",
    name: "River Serpent",
    type: "unit",
    cost: 4,
    attack: 4,
    health: 4,
    text: "A clean midgame threat.",
    artLabel: "Serpent",
    visualTheme: "river"
  },
  {
    id: "storm-rider",
    name: "Storm Rider",
    type: "unit",
    cost: 5,
    attack: 5,
    health: 4,
    text: "A fast finisher that pressures open boards.",
    artLabel: "Storm",
    visualTheme: "storm"
  },
  {
    id: "vine-lurker",
    name: "Vine Lurker",
    type: "unit",
    cost: 3,
    attack: 2,
    health: 4,
    text: "Sticky midgame body that holds the line well.",
    artLabel: "Vines",
    visualTheme: "vine"
  },
  {
    id: "lunar-mage",
    name: "Lunar Mage",
    type: "unit",
    cost: 4,
    attack: 3,
    health: 5,
    text: "A resilient caster that stabilizes the board.",
    artLabel: "Moon",
    visualTheme: "lunar"
  },
  {
    id: "siege-golem",
    name: "Siege Golem",
    type: "unit",
    cost: 6,
    attack: 6,
    health: 6,
    text: "A slow finisher that dominates empty boards.",
    artLabel: "Golem",
    visualTheme: "stone"
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
    ],
    artLabel: "Flame",
    visualTheme: "ember"
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
    ],
    artLabel: "Plans",
    visualTheme: "tactics"
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
    ],
    artLabel: "Sweep",
    visualTheme: "ember"
  },
  {
    id: "spark-burst",
    name: "Spark Burst",
    type: "spell",
    cost: 1,
    text: "Deal 2 damage to the enemy hero.",
    effects: [
      {
        kind: "damage-hero",
        amount: 2,
        target: "enemy"
      }
    ],
    artLabel: "Burst",
    visualTheme: "spark"
  },
  {
    id: "river-mist",
    name: "River Mist",
    type: "spell",
    cost: 3,
    text: "Draw 2 cards.",
    effects: [
      {
        kind: "draw",
        amount: 2,
        target: "self"
      }
    ],
    artLabel: "Mist",
    visualTheme: "river"
  },
  {
    id: "storm-surge",
    name: "Storm Surge",
    type: "spell",
    cost: 5,
    text: "Deal 3 damage to all enemy units.",
    effects: [
      {
        kind: "damage-units",
        amount: 3,
        side: "enemy"
      }
    ],
    artLabel: "Surge",
    visualTheme: "storm"
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
    },
    artLabel: "Snare",
    visualTheme: "snare"
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
    },
    artLabel: "Wire",
    visualTheme: "wire"
  },
  {
    id: "mirror-rune",
    name: "Mirror Rune",
    type: "trap",
    cost: 1,
    text: "When your opponent casts a spell, deal 2 damage to that player.",
    trigger: "enemy-spell",
    effect: {
      kind: "damage-spell-owner",
      amount: 2
    },
    artLabel: "Rune",
    visualTheme: "lunar"
  },
  {
    id: "bramble-pit",
    name: "Bramble Pit",
    type: "trap",
    cost: 3,
    text: "When an enemy unit attacks, destroy that attacker and cancel the attack.",
    trigger: "enemy-attack",
    effect: {
      kind: "destroy-attacker",
      cancelAttack: true
    },
    artLabel: "Bramble",
    visualTheme: "vine"
  }
];

export const CARD_INDEX = Object.fromEntries(CARD_LIBRARY.map((card) => [card.id, card])) as Record<
  string,
  CardDefinition
>;

export const isUnitCard = (card: CardDefinition): card is UnitCardDefinition => card.type === "unit";

export const isTrapCard = (card: CardDefinition): card is TrapCardDefinition => card.type === "trap";

export const getCardById = (cardId: string): CardDefinition => CARD_INDEX[cardId];
