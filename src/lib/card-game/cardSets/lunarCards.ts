import type { CardDefinition } from "../types";
import { drawOne, spell, trap, unit } from "./helpers";

export const LUNAR_CARDS: CardDefinition[] = [
  unit({ id: "veil-scout", name: "Veil Scout", set: "moonwire", family: "lunar", cost: 1, attack: 1, health: 2, text: "Stealth. Slips past early trades.", artLabel: "Scout", visualTheme: "dusk", keywords: ["stealth"] }),
  unit({ id: "moonshot-arcanist", name: "Moonshot Arcanist", set: "moonwire", family: "lunar", cost: 2, attack: 2, health: 3, text: "Ranged. Cheap answer to fliers.", artLabel: "Shot", visualTheme: "lunar", keywords: ["ranged"] }),
  unit({ id: "mirror-adept", name: "Mirror Adept", set: "moonwire", family: "lunar", cost: 2, attack: 2, health: 2, text: "On play: heal your hero for 2.", artLabel: "Mirror", visualTheme: "lunar", onPlayEffects: [{ kind: "heal-hero", amount: 2, target: "self" }] }),
  unit({ id: "eclipse-sage", name: "Eclipse Sage", set: "moonwire", family: "lunar", cost: 3, attack: 2, health: 3, text: "On play: draw 1 card.", artLabel: "Eclipse", visualTheme: "lunar", onPlayEffects: [drawOne] }),
  unit({ id: "astral-falcon", name: "Astral Falcon", set: "moonwire", family: "lunar", cost: 3, attack: 3, health: 2, text: "Flying. Clean evasive threat.", artLabel: "Astral", visualTheme: "lunar", keywords: ["flying"] }),
  unit({ id: "whisperblade", name: "Whisperblade", set: "moonwire", family: "lunar", cost: 3, attack: 3, health: 2, text: "Swift, Stealth. Strong tempo swing if unanswered.", artLabel: "Whisper", visualTheme: "dusk", keywords: ["swift", "stealth"] }),
  unit({ id: "grave-orbiter", name: "Grave Orbiter", set: "moonwire", family: "lunar", cost: 4, attack: 3, health: 4, text: "On death: deal 2 to the enemy hero.", artLabel: "Orbit", visualTheme: "lunar", onDeathEffects: [{ kind: "damage-hero", amount: 2, target: "enemy" }] }),
  unit({ id: "starweaver", name: "Starweaver", set: "moonwire", family: "lunar", cost: 5, attack: 4, health: 5, text: "Ranged. Heavy spell-value body.", artLabel: "Weave", visualTheme: "wire", keywords: ["ranged"] }),
  spell({ id: "hex-drift", name: "Hex Drift", set: "moonwire", family: "lunar", cost: 3, text: "Return the strongest enemy unit to its owner's hand.", effects: [{ kind: "bounce-unit", selector: "highest-attack-enemy" }], artLabel: "Hex", visualTheme: "wire" }),
  spell({ id: "moonwell", name: "Moonwell", set: "moonwire", family: "lunar", cost: 2, text: "Restore 4 health to a damaged allied unit.", effects: [{ kind: "heal-unit", amount: 4, selector: "damaged-ally" }], artLabel: "Well", visualTheme: "lunar" }),
  spell({ id: "starfall", name: "Starfall", set: "moonwire", family: "lunar", cost: 5, text: "Deal 5 damage to the strongest enemy unit.", effects: [{ kind: "damage-unit", amount: 5, selector: "highest-attack-enemy" }], artLabel: "Fall", visualTheme: "lunar" }),
  spell({ id: "foresight", name: "Foresight", set: "moonwire", family: "lunar", cost: 2, text: "Draw 2 cards and gain 1 resource this turn.", effects: [{ kind: "draw", amount: 2, target: "self" }, { kind: "gain-resource", amount: 1, target: "self" }], artLabel: "Sight", visualTheme: "tactics" }),
  trap({ id: "mana-lattice", name: "Mana Lattice", set: "moonwire", family: "lunar", cost: 2, text: "When your opponent casts a spell, they pay 1 more or it is countered.", trigger: "enemy-spell", effect: { kind: "spell-tax", taxAmount: 1 }, artLabel: "Lattice", visualTheme: "wire" })
];
