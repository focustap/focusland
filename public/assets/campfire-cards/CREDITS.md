# Campfire Cards Asset Credits

Game UI composition in `src/pages/CampfireCards.tsx` and `src/lib/campfire-cards` is original to this project.

Card pack text in `src/lib/campfire-cards/packs.ts` was imported from the user-provided local CSV at `D:/Downloads/Base Card Pack.csv`.
Main Deck text in `src/lib/campfire-cards/packs.ts` was imported from the user-provided local CSV at `D:/Downloads/Cards Against Humanity - CAH Main Deck.csv`.

## Card Import Notes

- Local CSV import source: `D:/Downloads/Base Card Pack.csv`.
- Local main deck CSV source: `D:/Downloads/Cards Against Humanity - CAH Main Deck.csv`.
- Import filter: only one-answer prompts were included. Multi-answer prompts such as `PICK 2`, `PICK 3`, draw-multiple prompts, and multiple-blank prompts were excluded.
- Reimport path: provide a CSV of prompt/response cards, then run `node scripts/import-campfire-cards.mjs path/to/cards.csv`.

## Bundled Assets

- Forest background: "Forest - Backgrounds" by Cethiel, OpenGameArt, CC0. Source: https://opengameart.org/content/forest-backgrounds
- Card back and empty card sprites: "Playing Cards Pack" by Kenney, OpenGameArt, CC0. Source: https://opengameart.org/content/playing-cards-pack
- UI sound effects: "Interface Sounds" by Kenney, OpenGameArt, CC0. Source: https://opengameart.org/content/interface-sounds
- Background music: "Doodle menu like song" by StumpyStrust, OpenGameArt, CC0. Source: https://opengameart.org/content/doodle-menu-like-song
- Alternate downloaded music reference: "Happy Adventure (Loop)" by TinyWorlds, OpenGameArt, CC0. Source: https://opengameart.org/content/happy-adventure-loop
- Campfire ambience: "Campfire sound ambience.ogg" by Glaneur de sons, Wikimedia Commons, CC BY 3.0. Source: https://commons.wikimedia.org/wiki/File:Campfire_sound_ambience.ogg License: https://creativecommons.org/licenses/by/3.0/

## Researched But Not Bundled

- "Ambiance_Campfire_Loop_Stereo.wav" by Nox_Sound on Freesound is CC0 and a strong fit, but Freesound requires login to download. Source: https://freesound.org/people/Nox_Sound/sounds/558967/
