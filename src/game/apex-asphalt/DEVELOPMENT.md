# Apex Asphalt Development Log

This file is the running TODO and progress log for the arcade racing game integration.

## TODO

- [x] Add a dedicated arcade route and machine entry for the racer.
- [x] Build a full race loop with countdown, laps, checkpoints, AI, HUD updates, and finish states.
- [x] Ship at least two distinct track layouts with different handling demands.
- [x] Create polished procedural art for track, cars, scenery, sparks, and smoke without broad repo impact.
- [x] Run browser playtests, capture screenshots, and document polish fixes from those passes.
- [x] Verify the site build and fix any integration issues.

## Progress Log

### 2026-04-19 20:57 ET

- Scoped the feature to a new `Apex Asphalt` arcade minigame.
- Chose a top-down 2D Phaser racer so the game can be finished, readable, and fun in a single pass.
- Planned a self-contained module with procedural art instead of adding broad binary asset churn.
- Set the target feature bar: start menu, live HUD, clear win/lose result, restart/menu flow, multiple tracks, opponent AI, collision feedback, and build-safe arcade integration.

### 2026-04-19 21:54 ET

- Added the shipped route and arcade machine entry: `/arcade/apex-asphalt`.
- Built the Phaser race scene around a sampled closed spline track model with:
  - continuous car handling and off-road slowdown
  - lap progression by sector checkpoints
  - AI rivals with target lookahead and corner-speed management
  - player place/time/speed HUD callbacks for the React page shell
  - score and gold payout on finish
- Created two circuit variants:
  - `Neon Loop` for wide, fast-flowing corner chains
  - `Harbor Hairpin` for tighter rotation and more technical pacing
- Chose procedural art for road, scenery, cars, skid smoke, and sparks to keep the asset footprint light while still shipping a complete look.

### 2026-04-19 22:12 ET

- Browser-tested through a temporary local QA harness mounted directly against the same Phaser module because the real arcade route is protected behind auth.
- Captured representative screenshots in `.tmp/apex-playtest/`:
  - `apex-grid-neon.png`
  - `apex-neon-live.png`
  - `apex-neon-result.png`
  - `apex-harbor-live.png`
- Polished based on that pass:
  - fixed the countdown display so the grid starts at `3` instead of showing `4`
  - added a harness-only autoplay option so the QA pass could complete a full race without altering the shipped control path
- Verified production build with `npm run build`.
- Residual note:
  - the temporary harness is less reliable when hot-swapping tracks repeatedly in one browser session, but the shipped page flow always mounts a fresh race from the menu and the build is clean.
