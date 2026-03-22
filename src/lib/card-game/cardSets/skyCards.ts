import type { CardDefinition } from "../types";
import { drawOne, spell, trap, unit } from "./helpers";

export const SKY_CARDS: CardDefinition[] = [
  unit({ id: "cloud-skirmisher", name: "Cloud Skirmisher", set: "skybreak", family: "sky", cost: 1, attack: 2, health: 1, text: "Swift. Opens air-tempo starts.", artLabel: "Cloud", visualTheme: "storm", keywords: ["swift"] }),
  unit({ id: "windstep-ranger", name: "Windstep Ranger", set: "skybreak", family: "sky", cost: 2, attack: 2, health: 2, text: "Ranged. A cheap anti-air anchor.", artLabel: "Ranger", visualTheme: "storm", keywords: ["ranged"] }),
  unit({ id: "thunderwing-ace", name: "Thunderwing Ace", set: "skybreak", family: "sky", cost: 3, attack: 3, health: 2, text: "Flying. On play: deal 1 to the enemy hero.", artLabel: "Ace", visualTheme: "storm", keywords: ["flying"], onPlayEffects: [{ kind: "damage-hero", amount: 1, target: "enemy" }] }),
  unit({ id: "gale-sentinel", name: "Gale Sentinel", set: "skybreak", family: "sky", cost: 3, attack: 2, health: 4, text: "Flying, Guard. Defends the skies while holding the line.", artLabel: "Sentinel", visualTheme: "storm", keywords: ["flying", "guard"] }),
  unit({ id: "skyglass-spotter", name: "Skyglass Spotter", set: "skybreak", family: "sky", cost: 3, attack: 2, health: 3, text: "Ranged. On play: draw 1 card.", artLabel: "Glass", visualTheme: "tactics", keywords: ["ranged"], onPlayEffects: [drawOne] }),
  unit({ id: "horizon-spearhawk", name: "Horizon Spearhawk", set: "skybreak", family: "sky", cost: 4, attack: 4, health: 3, text: "Flying. Clean evasive pressure.", artLabel: "Spear", visualTheme: "storm", keywords: ["flying"] }),
  unit({ id: "updraft-monk", name: "Updraft Monk", set: "skybreak", family: "sky", cost: 4, attack: 3, health: 4, text: "On play: give your strongest unit +1/+1.", artLabel: "Updraft", visualTheme: "lunar", onPlayEffects: [{ kind: "buff-unit", selector: "highest-attack-ally", attack: 1, health: 1 }] }),
  unit({ id: "cirrus-raider", name: "Cirrus Raider", set: "skybreak", family: "sky", cost: 5, attack: 5, health: 3, text: "Flying, Swift. Hits immediately from above.", artLabel: "Raider", visualTheme: "storm", keywords: ["flying", "swift"] }),
  spell({ id: "tailwind-charge", name: "Tailwind Charge", set: "skybreak", family: "sky", cost: 1, text: "Gain 2 resource this turn.", effects: [{ kind: "gain-resource", amount: 2, target: "self" }], artLabel: "Tailwind", visualTheme: "storm" }),
  spell({ id: "pinion-volley", name: "Pinion Volley", set: "skybreak", family: "sky", cost: 2, text: "Deal 3 damage to the weakest enemy unit.", effects: [{ kind: "damage-unit", amount: 3, selector: "lowest-health-enemy" }], artLabel: "Volley", visualTheme: "storm" }),
  spell({ id: "updraft-blessing", name: "Updraft Blessing", set: "skybreak", family: "sky", cost: 3, text: "Give your strongest unit +2/+2.", effects: [{ kind: "buff-unit", selector: "highest-attack-ally", attack: 2, health: 2 }], artLabel: "Bless", visualTheme: "lunar" }),
  spell({ id: "clean-break", name: "Clean Break", set: "skybreak", family: "sky", cost: 4, text: "Return the strongest enemy unit to its owner's hand.", effects: [{ kind: "bounce-unit", selector: "highest-attack-enemy" }], artLabel: "Break", visualTheme: "tactics" }),
  trap({ id: "storm-tariff", name: "Storm Tariff", set: "skybreak", family: "sky", cost: 2, text: "When your opponent casts a spell, they pay 1 more or it is countered.", trigger: "enemy-spell", effect: { kind: "spell-tax", taxAmount: 1 }, artLabel: "Tariff", visualTheme: "wire" })
];
