import type { CardDefinition } from "../types";
import { drawOne, spell, trap, unit } from "./helpers";

export const WILD_CARDS: CardDefinition[] = [
  unit({ id: "canopy-stalker", name: "Canopy Stalker", set: "wildgrove", family: "wild", cost: 2, attack: 3, health: 1, text: "Stealth. Bursts from cover later.", artLabel: "Canopy", visualTheme: "vine", keywords: ["stealth"] }),
  unit({ id: "thorn-archer", name: "Thorn Archer", set: "wildgrove", family: "wild", cost: 2, attack: 2, health: 2, text: "Ranged. Basic anti-air for wild decks.", artLabel: "Thorn", visualTheme: "vine", keywords: ["ranged"] }),
  unit({ id: "seed-carrier", name: "Seed Carrier", set: "wildgrove", family: "wild", cost: 2, attack: 1, health: 3, text: "On play: gain 1 resource this turn.", artLabel: "Seed", visualTheme: "vine", onPlayEffects: [{ kind: "gain-resource", amount: 1, target: "self" }] }),
  unit({ id: "savage-sapling", name: "Savage Sapling", set: "wildgrove", family: "wild", cost: 3, attack: 2, health: 4, text: "On play: heal your weakest unit for 2.", artLabel: "Sapling", visualTheme: "vine", onPlayEffects: [{ kind: "heal-unit", amount: 2, selector: "lowest-health-ally" }] }),
  unit({ id: "moss-howler", name: "Moss Howler", set: "wildgrove", family: "wild", cost: 3, attack: 3, health: 4, text: "On play: give itself +0/+2.", artLabel: "Howl", visualTheme: "vine", onPlayEffects: [{ kind: "buff-unit", selector: "self", attack: 0, health: 2 }] }),
  unit({ id: "rot-bloom-witch", name: "Rot-Bloom Witch", set: "wildgrove", family: "wild", cost: 4, attack: 3, health: 3, text: "On death: draw 1 card.", artLabel: "Rot", visualTheme: "lunar", onDeathEffects: [drawOne] }),
  unit({ id: "briar-guardian", name: "Briar Guardian", set: "wildgrove", family: "wild", cost: 4, attack: 3, health: 5, text: "Guard. On death: deal 2 to the enemy hero.", artLabel: "Briar", visualTheme: "snare", keywords: ["guard"], onDeathEffects: [{ kind: "damage-hero", amount: 2, target: "enemy" }] }),
  unit({ id: "vineback-giant", name: "Vineback Giant", set: "wildgrove", family: "wild", cost: 5, attack: 4, health: 7, text: "Guard. Hard to push through.", artLabel: "Giant", visualTheme: "vine", keywords: ["guard"] }),
  spell({ id: "root-snag", name: "Root Snag", set: "wildgrove", family: "wild", cost: 3, text: "Give the strongest enemy unit -2/-2.", effects: [{ kind: "debuff-unit", selector: "highest-attack-enemy", attack: 2, health: 2 }], artLabel: "Root", visualTheme: "snare" }),
  spell({ id: "rebloom", name: "Rebloom", set: "wildgrove", family: "wild", cost: 2, text: "Return a damaged allied unit to your hand.", effects: [{ kind: "bounce-unit", selector: "damaged-ally" }], artLabel: "Bloom", visualTheme: "vine" }),
  spell({ id: "sap-surge", name: "Sap Surge", set: "wildgrove", family: "wild", cost: 3, text: "Heal your hero for 4.", effects: [{ kind: "heal-hero", amount: 4, target: "self" }], artLabel: "Sap", visualTheme: "vine" }),
  spell({ id: "forest-call", name: "Forest Call", set: "wildgrove", family: "wild", cost: 2, text: "Give your weakest unit +1/+2.", effects: [{ kind: "buff-unit", selector: "lowest-health-ally", attack: 1, health: 2 }], artLabel: "Call", visualTheme: "tactics" }),
  trap({ id: "thorn-barricade", name: "Thorn Barricade", set: "wildgrove", family: "wild", cost: 2, text: "When an enemy unit attacks, destroy that attacker and cancel the attack.", trigger: "enemy-attack", effect: { kind: "destroy-attacker", cancelAttack: true }, artLabel: "Wall", visualTheme: "snare" })
];
