import type { CardDefinition } from "../types";
import { spell, trap, unit } from "./helpers";

export const PACK_EXCLUSIVE_CARDS: CardDefinition[] = [
  unit({
    id: "ember-fox",
    name: "Ember Fox",
    set: "emberwake",
    family: "ember",
    cost: 2,
    attack: 3,
    health: 1,
    text: "Swift. Gets in early and trades up.",
    artLabel: "Fox",
    visualTheme: "ember",
    keywords: ["swift"]
  }),
  spell({
    id: "magma-burst",
    name: "Magma Burst",
    set: "emberwake",
    family: "ember",
    cost: 4,
    text: "Deal 3 damage to the strongest enemy unit and 2 damage to the enemy hero.",
    effects: [
      { kind: "damage-unit", amount: 3, selector: "highest-attack-enemy" },
      { kind: "damage-hero", amount: 2, target: "enemy" }
    ],
    artLabel: "Magma",
    visualTheme: "ember"
  }),
  trap({
    id: "coal-ambush",
    name: "Cinder Tripwire",
    set: "emberwake",
    family: "ember",
    cost: 2,
    text: "When an enemy unit attacks, deal 3 damage to that attacker.",
    trigger: "enemy-attack",
    effect: { kind: "damage-attacker", amount: 3, cancelAttack: false },
    artLabel: "Coal",
    visualTheme: "snare"
  }),
  unit({
    id: "tidal-oracle",
    name: "Tidal Oracle",
    set: "tideveil",
    family: "tide",
    cost: 3,
    attack: 2,
    health: 4,
    text: "On play: draw 1 card.",
    artLabel: "Oracle",
    visualTheme: "river",
    onPlayEffects: [{ kind: "draw", amount: 1, target: "self" }]
  }),
  spell({
    id: "moon-riptide",
    name: "Moon Riptide",
    set: "moonwire",
    family: "lunar",
    cost: 4,
    text: "Return the strongest enemy unit to its owner's hand and draw 1 card.",
    effects: [
      { kind: "bounce-unit", selector: "highest-attack-enemy" },
      { kind: "draw", amount: 1, target: "self" }
    ],
    artLabel: "Riptide",
    visualTheme: "lunar"
  }),
  trap({
    id: "mist-mirror",
    name: "Mist Mirror",
    set: "tideveil",
    family: "tide",
    cost: 2,
    text: "When your opponent casts a spell, heal your hero for 4.",
    trigger: "enemy-spell",
    effect: { kind: "triggered-effect", effect: { kind: "heal-hero", amount: 4, target: "self" } },
    artLabel: "Mirror",
    visualTheme: "wire"
  }),
  unit({
    id: "thornhide-stag",
    name: "Thornhide Stag",
    set: "wildgrove",
    family: "wild",
    cost: 4,
    attack: 4,
    health: 5,
    text: "Guard. A thick midgame wall.",
    artLabel: "Stag",
    visualTheme: "vine",
    keywords: ["guard"]
  }),
  spell({
    id: "grove-surge",
    name: "Grove Surge",
    set: "wildgrove",
    family: "wild",
    cost: 3,
    text: "Give your lowest-health ally +2/+3.",
    effects: [{ kind: "buff-unit", selector: "lowest-health-ally", attack: 2, health: 3 }],
    artLabel: "Grove",
    visualTheme: "vine"
  }),
  unit({
    id: "iron-watcher",
    name: "Iron Watcher",
    set: "ironroot",
    family: "iron",
    cost: 3,
    attack: 2,
    health: 5,
    text: "Ranged. Holds the line and chips away.",
    artLabel: "Watcher",
    visualTheme: "iron",
    keywords: ["ranged"]
  }),
  trap({
    id: "rootlock-grid",
    name: "Rootlock Grid",
    set: "ironroot",
    family: "iron",
    cost: 3,
    text: "When your opponent casts a spell, deal 3 damage to their weakest unit.",
    trigger: "enemy-spell",
    effect: { kind: "triggered-effect", effect: { kind: "damage-unit", amount: 3, selector: "lowest-health-enemy" } },
    artLabel: "Grid",
    visualTheme: "wire"
  }),
  unit({
    id: "skyfire-kite",
    name: "Skyfire Kite",
    set: "skybreak",
    family: "sky",
    cost: 3,
    attack: 3,
    health: 3,
    text: "Flying. On play: gain 1 resource this turn.",
    artLabel: "Kite",
    visualTheme: "storm",
    keywords: ["flying"],
    onPlayEffects: [{ kind: "gain-resource", amount: 1, target: "self" }]
  }),
  spell({
    id: "cloudbreak-volley",
    name: "Cloudbreak Volley",
    set: "skybreak",
    family: "sky",
    cost: 5,
    text: "Deal 2 damage to all enemy units and 1 damage to the enemy hero.",
    effects: [
      { kind: "damage-units", amount: 2, side: "enemy" },
      { kind: "damage-hero", amount: 1, target: "enemy" }
    ],
    artLabel: "Volley",
    visualTheme: "storm"
  })
];
