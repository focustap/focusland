import type { CardDefinition } from "../types";
import { spell, trap, unit } from "./helpers";

export const EMBER_CARDS: CardDefinition[] = [
  unit({ id: "cinder-runner", name: "Cinder Runner", set: "emberwake", family: "ember", cost: 1, attack: 2, health: 1, text: "Swift. Fast chip damage.", artLabel: "Cinder", visualTheme: "ember", keywords: ["swift"] }),
  unit({ id: "ash-hexer", name: "Ash Hexer", set: "emberwake", family: "ember", cost: 2, attack: 2, health: 2, text: "Ranged. Picks at fliers while backing burn.", artLabel: "Ash", visualTheme: "ember", keywords: ["ranged"] }),
  unit({ id: "flare-priest", name: "Flare Priest", set: "emberwake", family: "ember", cost: 3, attack: 2, health: 3, text: "On play: deal 2 to the weakest enemy unit.", artLabel: "Priest", visualTheme: "ember", onPlayEffects: [{ kind: "damage-unit", amount: 2, selector: "lowest-health-enemy" }] }),
  unit({ id: "blaze-raider", name: "Blaze Raider", set: "emberwake", family: "ember", cost: 3, attack: 3, health: 2, text: "On play: deal 2 to the enemy hero.", artLabel: "Blaze", visualTheme: "ember", onPlayEffects: [{ kind: "damage-hero", amount: 2, target: "enemy" }] }),
  unit({ id: "ember-duelist", name: "Ember Duelist", set: "emberwake", family: "ember", cost: 3, attack: 3, health: 2, text: "Swift. Good at finishing windows.", artLabel: "Duel", visualTheme: "dusk", keywords: ["swift"] }),
  unit({ id: "furnace-drake", name: "Furnace Drake", set: "emberwake", family: "ember", cost: 4, attack: 4, health: 3, text: "Flying. Midgame burn finisher.", artLabel: "Furnace", visualTheme: "ember", keywords: ["flying"] }),
  unit({ id: "pyre-hound", name: "Pyre Hound", set: "emberwake", family: "ember", cost: 4, attack: 4, health: 2, text: "On death: deal 2 to the enemy hero.", artLabel: "Pyre", visualTheme: "ember", onDeathEffects: [{ kind: "damage-hero", amount: 2, target: "enemy" }] }),
  unit({ id: "smokestack-ogre", name: "Smokestack Ogre", set: "emberwake", family: "ember", cost: 5, attack: 5, health: 5, text: "Heavy pressure body for burn decks.", artLabel: "Smoke", visualTheme: "stone" }),
  spell({ id: "flash-fuel", name: "Flash Fuel", set: "emberwake", family: "ember", cost: 1, text: "Gain 2 resource this turn.", effects: [{ kind: "gain-resource", amount: 2, target: "self" }], artLabel: "Fuel", visualTheme: "spark" }),
  spell({ id: "scorchtip", name: "Scorchtip", set: "emberwake", family: "ember", cost: 3, text: "Deal 4 damage to the strongest enemy unit.", effects: [{ kind: "damage-unit", amount: 4, selector: "highest-attack-enemy" }], artLabel: "Scorch", visualTheme: "ember" }),
  spell({ id: "rally-the-flame", name: "Rally the Flame", set: "emberwake", family: "ember", cost: 2, text: "Give your strongest unit +3/+0.", effects: [{ kind: "buff-unit", selector: "highest-attack-ally", attack: 3, health: 0 }], artLabel: "Rally", visualTheme: "spark" }),
  spell({ id: "wildfire-ring", name: "Wildfire Ring", set: "emberwake", family: "ember", cost: 4, text: "Deal 1 damage to all enemy units.", effects: [{ kind: "damage-units", amount: 1, side: "enemy" }], artLabel: "Ring", visualTheme: "ember" }),
  trap({ id: "ember-levy", name: "Ember Levy", set: "emberwake", family: "ember", cost: 2, text: "When your opponent casts a spell, they pay 2 more or it is countered.", trigger: "enemy-spell", effect: { kind: "spell-tax", taxAmount: 2 }, artLabel: "Levy", visualTheme: "wire" })
];
