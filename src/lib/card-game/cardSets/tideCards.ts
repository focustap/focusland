import type { CardDefinition } from "../types";
import { drawOne, spell, trap, unit } from "./helpers";

export const TIDE_CARDS: CardDefinition[] = [
  unit({ id: "mist-channeler", name: "Mist Channeler", set: "tideveil", family: "tide", cost: 2, attack: 1, health: 4, text: "Ranged. Slow anti-air stabilizer.", artLabel: "Mist", visualTheme: "river", keywords: ["ranged"] }),
  unit({ id: "harbor-turtle", name: "Harbor Turtle", set: "tideveil", family: "tide", cost: 2, attack: 1, health: 5, text: "Guard. Early wall for control decks.", artLabel: "Harbor", visualTheme: "river", keywords: ["guard"] }),
  unit({ id: "pearl-diver", name: "Pearl Diver", set: "tideveil", family: "tide", cost: 3, attack: 2, health: 3, text: "On play: draw 1 card.", artLabel: "Pearl", visualTheme: "river", onPlayEffects: [drawOne] }),
  unit({ id: "undertow-mage", name: "Undertow Mage", set: "tideveil", family: "tide", cost: 3, attack: 2, health: 3, text: "On play: return the strongest enemy unit to its owner's hand.", artLabel: "Undertow", visualTheme: "river", onPlayEffects: [{ kind: "bounce-unit", selector: "highest-attack-enemy" }] }),
  unit({ id: "reef-hunter", name: "Reef Hunter", set: "tideveil", family: "tide", cost: 3, attack: 3, health: 3, text: "Reliable tide midgame attacker.", artLabel: "Reef", visualTheme: "river" }),
  unit({ id: "wave-rider", name: "Wave Rider", set: "tideveil", family: "tide", cost: 4, attack: 4, health: 3, text: "Swift. Turns tempo spells into pressure.", artLabel: "Wave", visualTheme: "river", keywords: ["swift"] }),
  unit({ id: "flood-drake", name: "Flood Drake", set: "tideveil", family: "tide", cost: 4, attack: 3, health: 4, text: "Flying. Blue decks still need real closers.", artLabel: "Flood", visualTheme: "river", keywords: ["flying"] }),
  unit({ id: "stormbreak-leviathan", name: "Stormbreak Leviathan", set: "tideveil", family: "tide", cost: 6, attack: 6, health: 7, text: "Big control finisher.", artLabel: "Leviathan", visualTheme: "storm" }),
  spell({ id: "healing-rain", name: "Healing Rain", set: "tideveil", family: "tide", cost: 3, text: "Heal your hero for 5.", effects: [{ kind: "heal-hero", amount: 5, target: "self" }], artLabel: "Rain", visualTheme: "river" }),
  spell({ id: "undertow", name: "Undertow", set: "tideveil", family: "tide", cost: 3, text: "Return the strongest enemy unit to its owner's hand.", effects: [{ kind: "bounce-unit", selector: "highest-attack-enemy" }], artLabel: "Pull", visualTheme: "river" }),
  spell({ id: "tidal-focus", name: "Tidal Focus", set: "tideveil", family: "tide", cost: 2, text: "Draw 2 cards and gain 1 resource this turn.", effects: [{ kind: "draw", amount: 2, target: "self" }, { kind: "gain-resource", amount: 1, target: "self" }], artLabel: "Focus", visualTheme: "tactics" }),
  spell({ id: "freeze-current", name: "Freeze Current", set: "tideveil", family: "tide", cost: 3, text: "Give the strongest enemy unit -3/-1.", effects: [{ kind: "debuff-unit", selector: "highest-attack-enemy", attack: 3, health: 1 }], artLabel: "Freeze", visualTheme: "river" }),
  trap({ id: "riptide-sigil", name: "Riptide Sigil", set: "tideveil", family: "tide", cost: 2, text: "When an enemy unit attacks, destroy that attacker and cancel the attack.", trigger: "enemy-attack", effect: { kind: "destroy-attacker", cancelAttack: true }, artLabel: "Riptide", visualTheme: "wire" })
];
