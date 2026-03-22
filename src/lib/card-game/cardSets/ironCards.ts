import type { CardDefinition } from "../types";
import { spell, trap, unit } from "./helpers";

export const IRON_CARDS: CardDefinition[] = [
  unit({ id: "trench-sentinel", name: "Trench Sentinel", set: "ironroot", family: "iron", cost: 2, attack: 2, health: 4, text: "Guard. Thick early wall.", artLabel: "Trench", visualTheme: "iron", keywords: ["guard"] }),
  unit({ id: "bastion-smith", name: "Bastion Smith", set: "ironroot", family: "iron", cost: 3, attack: 2, health: 3, text: "On play: give your strongest unit +1/+1.", artLabel: "Smith", visualTheme: "iron", onPlayEffects: [{ kind: "buff-unit", selector: "highest-attack-ally", attack: 1, health: 1 }] }),
  unit({ id: "pike-engineer", name: "Pike Engineer", set: "ironroot", family: "iron", cost: 3, attack: 2, health: 4, text: "Guard, Ranged. Holds both ground and sky.", artLabel: "Pike", visualTheme: "iron", keywords: ["guard", "ranged"] }),
  unit({ id: "banner-captain", name: "Banner Captain", set: "ironroot", family: "iron", cost: 3, attack: 3, health: 3, text: "On play: heal your hero for 2.", artLabel: "Banner", visualTheme: "tactics", onPlayEffects: [{ kind: "heal-hero", amount: 2, target: "self" }] }),
  unit({ id: "clockbolt-sniper", name: "Clockbolt Sniper", set: "ironroot", family: "iron", cost: 4, attack: 4, health: 2, text: "Ranged. Picks off fragile threats.", artLabel: "Clock", visualTheme: "stone", keywords: ["ranged"] }),
  unit({ id: "steelclad-rhino", name: "Steelclad Rhino", set: "ironroot", family: "iron", cost: 5, attack: 4, health: 6, text: "Guard. Brutal midgame body.", artLabel: "Rhino", visualTheme: "stone", keywords: ["guard"] }),
  unit({ id: "mausoleum-keeper", name: "Mausoleum Keeper", set: "ironroot", family: "iron", cost: 4, attack: 2, health: 5, text: "On death: heal your hero for 3.", artLabel: "Keeper", visualTheme: "stone", onDeathEffects: [{ kind: "heal-hero", amount: 3, target: "self" }] }),
  unit({ id: "bulwark-titan", name: "Bulwark Titan", set: "ironroot", family: "iron", cost: 6, attack: 5, health: 8, text: "Guard. Ends races by itself.", artLabel: "Titan", visualTheme: "stone", keywords: ["guard"] }),
  spell({ id: "shield-march", name: "Shield March", set: "ironroot", family: "iron", cost: 3, text: "Give your weakest unit +1/+3.", effects: [{ kind: "buff-unit", selector: "lowest-health-ally", attack: 1, health: 3 }], artLabel: "March", visualTheme: "iron" }),
  spell({ id: "repair-order", name: "Repair Order", set: "ironroot", family: "iron", cost: 2, text: "Restore 4 health to a damaged allied unit.", effects: [{ kind: "heal-unit", amount: 4, selector: "damaged-ally" }], artLabel: "Repair", visualTheme: "tactics" }),
  spell({ id: "hammer-fall", name: "Hammer Fall", set: "ironroot", family: "iron", cost: 4, text: "Deal 4 damage to the strongest enemy unit.", effects: [{ kind: "damage-unit", amount: 4, selector: "highest-attack-enemy" }], artLabel: "Hammer", visualTheme: "stone" }),
  spell({ id: "recall-to-arms", name: "Recall to Arms", set: "ironroot", family: "iron", cost: 2, text: "Draw 1 card and gain 1 resource this turn.", effects: [{ kind: "draw", amount: 1, target: "self" }, { kind: "gain-resource", amount: 1, target: "self" }], artLabel: "Recall", visualTheme: "tactics" }),
  trap({ id: "counterweight", name: "Counterweight", set: "ironroot", family: "iron", cost: 2, text: "When your opponent casts a spell, they pay 2 more or it is countered.", trigger: "enemy-spell", effect: { kind: "spell-tax", taxAmount: 2 }, artLabel: "Weight", visualTheme: "wire" })
];
