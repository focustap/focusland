import React, { useEffect, useMemo, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import {
  DEFAULT_ZOMBTRAIN_SAVE,
  ZOMBTRAIN_DESTINATIONS,
  ZOMBTRAIN_UPGRADES,
  formatResourceLabel,
  getDestinationById,
  getPalettePreview,
  loadZombTrainSave,
  resetZombTrainSave,
  saveZombTrainSave,
  type ZombTrainDestination,
  type ZombTrainResourceKey,
  type ZombTrainSave,
  type ZombTrainTrainPalette,
  type ZombTrainView
} from "../lib/zombTrain";

type FishingState = {
  phase: "idle" | "playing" | "caught";
  fishY: number;
  bobberY: number;
  bobberVelocity: number;
  catchProgress: number;
  timer: number;
  holdActive: boolean;
  caughtFishName: string | null;
};

const INITIAL_FISHING_STATE: FishingState = {
  phase: "idle",
  fishY: 50,
  bobberY: 50,
  bobberVelocity: 0,
  catchProgress: 16,
  timer: 26,
  holdActive: false,
  caughtFishName: null
};

const ZombTrain: React.FC = () => {
  const [save, setSave] = useState<ZombTrainSave>(DEFAULT_ZOMBTRAIN_SAVE);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("Rolling toward a softer kind of survival.");
  const [fishing, setFishing] = useState<FishingState>(INITIAL_FISHING_STATE);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const titleGameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    setSave(loadZombTrainSave());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    saveZombTrainSave(save);
  }, [loaded, save]);

  useEffect(() => {
    if (!titleRef.current || titleGameRef.current) {
      return;
    }

    class ZombTrainTitleScene extends Phaser.Scene {
      trainShell!: Phaser.GameObjects.Rectangle;
      trainTrim!: Phaser.GameObjects.Rectangle;
      smoke!: Phaser.GameObjects.Group;
      drift = 0;

      create() {
        const width = 920;
        const height = 360;

        const sky = this.add.graphics();
        sky.fillGradientStyle(0x11223a, 0x1d3557, 0xf3c89c, 0x8bb5b4, 1);
        sky.fillRect(0, 0, width, height);
        this.add.ellipse(760, 76, 148, 66, 0xf7ddb6, 0.9);
        this.add.ellipse(742, 70, 196, 88, 0xfff3de, 0.16);

        for (let i = 0; i < 4; i += 1) {
          this.add.ellipse(120 + i * 210, 110 + (i % 2) * 18, 180, 60, 0xf5efe5, 0.16);
        }

        const hills = this.add.graphics();
        hills.fillStyle(0x415e61, 0.55);
        hills.fillRoundedRect(-20, 184, 320, 140, 90);
        hills.fillRoundedRect(180, 168, 400, 160, 120);
        hills.fillRoundedRect(500, 180, 320, 150, 100);
        hills.fillRoundedRect(690, 160, 280, 170, 120);

        const foreground = this.add.graphics();
        foreground.fillStyle(0x203b32, 0.95);
        foreground.fillRoundedRect(-20, 230, 280, 170, 90);
        foreground.fillRoundedRect(160, 252, 300, 150, 110);
        foreground.fillRoundedRect(390, 236, 260, 165, 100);
        foreground.fillRoundedRect(585, 248, 360, 160, 120);

        for (let i = 0; i < 8; i += 1) {
          const x = 38 + i * 118;
          this.add.rectangle(x, 312, 10, 50, 0x4d3428, 1).setAngle(-6);
          this.add.rectangle(x + 50, 312, 10, 50, 0x4d3428, 1).setAngle(6);
        }

        const rail = this.add.graphics();
        rail.lineStyle(6, 0xb8a18e, 1);
        rail.beginPath();
        rail.moveTo(-20, 274);
        rail.lineTo(width + 20, 274);
        rail.moveTo(-20, 306);
        rail.lineTo(width + 20, 306);
        rail.strokePath();

        this.trainShell = this.add.rectangle(360, 236, 170, 76, 0x5f7e65, 1).setStrokeStyle(4, 0xefe5c6, 1);
        this.trainTrim = this.add.rectangle(372, 212, 132, 24, 0xefe5c6, 0.95);
        this.add.rectangle(286, 246, 54, 54, 0x7b4933, 1).setStrokeStyle(4, 0xefe5c6, 0.95);
        this.add.rectangle(438, 232, 18, 44, 0x2b2019, 0.75);
        this.add.rectangle(352, 236, 40, 28, 0xa8d5d0, 0.9).setStrokeStyle(2, 0xffffff, 0.6);
        this.add.rectangle(398, 236, 40, 28, 0xa8d5d0, 0.9).setStrokeStyle(2, 0xffffff, 0.6);
        this.add.circle(308, 280, 20, 0x1d1d1d, 1).setStrokeStyle(6, 0x6f6f6f, 1);
        this.add.circle(414, 280, 20, 0x1d1d1d, 1).setStrokeStyle(6, 0x6f6f6f, 1);
        this.add.circle(264, 278, 12, 0x1d1d1d, 1).setStrokeStyle(4, 0x6f6f6f, 1);
        this.add.rectangle(278, 178, 16, 46, 0x34241a, 1).setStrokeStyle(3, 0xefe5c6, 0.7);
        this.add.rectangle(278, 156, 26, 12, 0x34241a, 1).setStrokeStyle(3, 0xefe5c6, 0.7);
        this.add.circle(248, 222, 16, 0xf5d49b, 0.95);
        this.add.circle(248, 222, 36, 0xf5d49b, 0.16);

        this.smoke = this.add.group();
        for (let i = 0; i < 7; i += 1) {
          this.smoke.add(this.add.circle(280, 140 - i * 8, 14 + i * 2, 0xf5efe5, 0.2 + i * 0.05));
        }
      }

      update(_time: number, delta: number) {
        this.drift += delta * 0.0011;
        this.trainShell.x = 360 + Math.sin(this.drift * 3.2) * 7;
        this.trainShell.y = 236 + Math.sin(this.drift * 7.6) * 2;
        this.trainTrim.x = 372 + Math.sin(this.drift * 3.2) * 7;
        this.trainTrim.y = 212 + Math.sin(this.drift * 7.6) * 2;

        let index = 0;
        this.smoke.children.each((child) => {
          const puff = child as Phaser.GameObjects.Arc;
          puff.x = 278 + Math.sin(this.drift * 1.6 + index) * 10 + index * 9;
          puff.y = 144 - ((this.drift * 140 + index * 20) % 120);
          puff.alpha = 0.42 - index * 0.04;
          index += 1;
        });
      }
    }

    titleGameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 920,
      height: 360,
      parent: titleRef.current,
      backgroundColor: "#0f1720",
      scene: ZombTrainTitleScene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    });

    return () => {
      titleGameRef.current?.destroy(true);
      titleGameRef.current = null;
    };
  }, []);

  const currentDestination = useMemo(() => getDestinationById(save.currentStopId), [save.currentStopId]);
  const selectedDestination = useMemo(() => getDestinationById(save.selectedDestinationId), [save.selectedDestinationId]);
  const palettePreview = getPalettePreview(save.train.palette);

  useEffect(() => {
    if (save.activeView !== "fishing" || fishing.phase !== "playing") {
      return;
    }

    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const delta = Math.min(32, time - lastTime);
      lastTime = time;

      setFishing((current) => {
        if (current.phase !== "playing") {
          return current;
        }

        const t = time / 1000;
        const fishY = 50 + Math.sin(t * 1.6) * 24 + Math.sin(t * 3.4) * 11;
        const lift = current.holdActive ? 0.025 * delta : -0.018 * delta;
        const bobberVelocity = Phaser.Math.Clamp(current.bobberVelocity + lift, -1.9, 1.8);
        const bobberY = Phaser.Math.Clamp(current.bobberY - bobberVelocity, 5, 95);
        const proximity = Math.abs(fishY - bobberY);
        const catchProgress = Phaser.Math.Clamp(current.catchProgress + (proximity < 16 ? 0.04 * delta : -0.032 * delta), 0, 100);
        const timer = Math.max(0, current.timer - delta / 1000);

        if (catchProgress >= 100) {
          return {
            ...current,
            phase: "caught",
            fishY,
            bobberY,
            bobberVelocity,
            catchProgress,
            timer,
            caughtFishName: getDestinationById(save.currentStopId).fishName ?? "Railcar trout"
          };
        }

        if (timer <= 0 || catchProgress <= 0) {
          return { ...INITIAL_FISHING_STATE };
        }

        return { ...current, fishY, bobberY, bobberVelocity, catchProgress, timer };
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [fishing.phase, save.activeView, save.currentStopId]);

  useEffect(() => {
    if (fishing.phase !== "caught") {
      return;
    }

    setSave((current) => ({
      ...current,
      inventory: { ...current.inventory, fish: current.inventory.fish + 1 },
      cozyMeter: Math.min(100, current.cozyMeter + 2),
      journal: [`Caught a ${fishing.caughtFishName ?? "railcar fish"} at ${getDestinationById(current.currentStopId).name}.`, ...current.journal].slice(0, 12)
    }));
    setStatus(`You landed a ${fishing.caughtFishName ?? "fresh fish"} and the whole train smells like dinner.`);
  }, [fishing.caughtFishName, fishing.phase]);

  const setActiveView = (activeView: ZombTrainView) => {
    setSave((current) => ({ ...current, activeView }));
  };

  const addResource = (resource: ZombTrainResourceKey, amount: number, message: string) => {
    setSave((current) => ({
      ...current,
      inventory: { ...current.inventory, [resource]: current.inventory[resource] + amount }
    }));
    setStatus(message);
  };

  const handleTravel = (destination: ZombTrainDestination) => {
    const riskCost = destination.risk === "High" ? 14 : destination.risk === "Medium" ? 9 : 5;
    setSave((current) => ({
      ...current,
      activeView: "map",
      currentStopId: destination.id,
      selectedDestinationId: destination.id,
      day: current.day + 1,
      cozyMeter: Math.max(35, Math.min(100, current.cozyMeter + (destination.risk === "Low" ? 4 : 1))),
      dangerMeter: Math.max(8, Math.min(100, current.dangerMeter + riskCost - Math.min(10, current.train.lanternGlow / 10))),
      journal: [`Rolled into ${destination.name}. ${destination.vibe}`, ...current.journal].slice(0, 12)
    }));
    setStatus(`The engine sighs into ${destination.name}. Time to fish, forage, or make a little money.`);
  };

  const handleForage = () => {
    const entries = Object.entries(currentDestination.forageYield) as Array<[ZombTrainResourceKey, number]>;
    if (entries.length === 0) {
      setStatus("Nothing worth gathering here right now.");
      return;
    }

    setSave((current) => {
      const nextInventory = { ...current.inventory };
      entries.forEach(([resource, amount]) => {
        nextInventory[resource] += amount;
      });
      return {
        ...current,
        inventory: nextInventory,
        cozyMeter: Math.min(100, current.cozyMeter + 1),
        dangerMeter: Math.max(0, current.dangerMeter - 1),
        journal: [`Gathered supplies at ${currentDestination.name}.`, ...current.journal].slice(0, 12)
      };
    });

    setStatus(`You took the scenic route and came back with ${entries.map(([resource, amount]) => `+${amount} ${formatResourceLabel(resource).toLowerCase()}`).join(", ")}.`);
  };

  const handleMine = () => {
    if (!currentDestination.mineYield) {
      setStatus("This stop is better for fishing and scavenging than mining.");
      return;
    }

    const entries = Object.entries(currentDestination.mineYield) as Array<[ZombTrainResourceKey, number]>;
    setSave((current) => {
      const nextInventory = { ...current.inventory };
      entries.forEach(([resource, amount]) => {
        nextInventory[resource] += amount;
      });
      return {
        ...current,
        inventory: nextInventory,
        dangerMeter: Math.min(100, current.dangerMeter + 4),
        journal: [`Worked the old shafts at ${currentDestination.name}.`, ...current.journal].slice(0, 12)
      };
    });

    setStatus("The haul was good, but the quarry echoes are never truly cozy.");
  };

  const handleSellBox = () => {
    const saleValue = save.inventory.fish * 12 + save.inventory.wood * 3 + save.inventory.ore * 9 + save.inventory.scrap * 5 + save.inventory.herbs * 4;
    if (saleValue <= 0) {
      setStatus("The sell box is empty. A cozy apocalypse still needs inventory.");
      return;
    }

    const coinsEarned = Math.round(saleValue * (currentDestination.sellBonus ?? 1));
    setSave((current) => ({
      ...current,
      inventory: {
        ...current.inventory,
        coins: current.inventory.coins + coinsEarned,
        fish: 0,
        wood: 0,
        ore: 0,
        scrap: 0,
        herbs: 0
      },
      cozyMeter: Math.min(100, current.cozyMeter + 3),
      journal: [`Sold the haul at ${currentDestination.name} for ${coinsEarned} coins.`, ...current.journal].slice(0, 12)
    }));
    setStatus(`You filled the sell box and cleared ${coinsEarned} coins.`);
  };

  const handleUpgradePurchase = (upgradeKey: string) => {
    const upgrade = ZOMBTRAIN_UPGRADES.find((item) => item.key === upgradeKey);
    if (!upgrade) return;
    if (save.upgrades.includes(upgrade.key)) {
      setStatus(`${upgrade.name} is already installed.`);
      return;
    }
    if (save.inventory.coins < upgrade.cost) {
      setStatus(`You need ${upgrade.cost - save.inventory.coins} more coins for ${upgrade.name}.`);
      return;
    }

    setSave((current) => ({
      ...current,
      inventory: { ...current.inventory, coins: current.inventory.coins - upgrade.cost },
      upgrades: [...current.upgrades, upgrade.key],
      cozyMeter: Math.min(100, current.cozyMeter + 6),
      train: {
        ...current.train,
        lanternGlow: upgrade.key === "lanterns" ? Math.min(100, current.train.lanternGlow + 18) : current.train.lanternGlow,
        plantCount: upgrade.key === "stove" ? Math.min(6, current.train.plantCount + 1) : current.train.plantCount
      },
      journal: [`Installed ${upgrade.name}.`, ...current.journal].slice(0, 12)
    }));
    setStatus(`${upgrade.name} is live. The train feels more like home now.`);
  };

  const handlePaletteChange = (palette: ZombTrainTrainPalette) => {
    setSave((current) => ({ ...current, train: { ...current.train, palette } }));
    setStatus(`Fresh paint, same apocalypse. ${palette} looks right on this train.`);
  };

  const handleFishingStart = () => {
    if (save.inventory.bait <= 0) {
      setStatus("You need bait before you can drop a line.");
      return;
    }

    setSave((current) => ({
      ...current,
      activeView: "fishing",
      inventory: { ...current.inventory, bait: current.inventory.bait - 1 }
    }));
    setFishing({ ...INITIAL_FISHING_STATE, phase: "playing" });
    setStatus(`Line in the water at ${currentDestination.name}. Keep the bobber on the fish like Stardew-style pressure.`);
  };

  const restartFishing = () => {
    setFishing({ ...INITIAL_FISHING_STATE, phase: "playing" });
    setStatus("Another cast, another chance.");
  };

  const startFresh = () => {
    setSave(resetZombTrainSave());
    setFishing(INITIAL_FISHING_STATE);
    setStatus("Fresh run started. Same soft blankets, different apocalypse.");
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card zombtrain-shell">
        <section className="zombtrain-hero">
          <div className="zombtrain-hero__copy">
            <p className="zombtrain-kicker">New Cozy Survival Prototype</p>
            <h1>ZombTrain</h1>
            <p className="zombtrain-lead">A warm train in a broken world. Travel to fishing holes, timber stops, and salvage towns, then bring the haul home to upgrade the railcar that keeps everyone going.</p>
            <div className="zombtrain-hero__actions">
              <button type="button" className="primary-button" onClick={() => setActiveView("map")}>Enter the train</button>
              <button type="button" className="secondary-button zombtrain-secondary-button" onClick={() => setActiveView("train")}>Customize railcar</button>
              <button type="button" className="secondary-button zombtrain-secondary-button" onClick={startFresh}>Fresh save</button>
            </div>
            <p className="info zombtrain-status">{status}</p>
          </div>
          <div className="zombtrain-hero__visual">
            <div ref={titleRef} className="zombtrain-title-canvas" />
            <div className="zombtrain-overlay-card">
              <span>Current stop</span>
              <strong>{currentDestination.name}</strong>
              <small>{currentDestination.vibe}</small>
            </div>
          </div>
        </section>

        <section className="zombtrain-dashboard">
          <div className="zombtrain-stat"><span>Day</span><strong>{save.day}</strong></div>
          <div className="zombtrain-stat"><span>Cozy</span><strong>{save.cozyMeter}%</strong></div>
          <div className="zombtrain-stat"><span>Danger</span><strong>{save.dangerMeter}%</strong></div>
          <div className="zombtrain-stat"><span>Coins</span><strong>{save.inventory.coins}</strong></div>
        </section>

        <section className="zombtrain-tabs">
          <button type="button" className={save.activeView === "map" ? "is-active" : ""} onClick={() => setActiveView("map")}>Route board</button>
          <button type="button" className={save.activeView === "train" ? "is-active" : ""} onClick={() => setActiveView("train")}>Train interior</button>
          <button type="button" className={save.activeView === "fishing" ? "is-active" : ""} onClick={() => setActiveView("fishing")}>Fishing</button>
        </section>

        <section className="zombtrain-grid">
          <div className="zombtrain-panel">
            <div className="zombtrain-panel__head">
              <h2>Destination loop</h2>
              <span>Tarkov-style pick-your-stop structure, but cozy-first.</span>
            </div>
            <div className="zombtrain-destinations">
              {ZOMBTRAIN_DESTINATIONS.map((destination) => (
                <button
                  key={destination.id}
                  type="button"
                  className={`zombtrain-destination ${save.selectedDestinationId === destination.id ? "is-selected" : ""}`}
                  onClick={() => setSave((current) => ({ ...current, selectedDestinationId: destination.id }))}
                >
                  <strong>{destination.name}</strong>
                  <span>{destination.vibe}</span>
                  <small>{destination.risk} risk • {destination.travelTime}</small>
                </button>
              ))}
            </div>
            <div className="zombtrain-stop-card">
              <h3>{selectedDestination.name}</h3>
              <p>{selectedDestination.vibe}</p>
              <div className="zombtrain-stop-meta">
                <span>Featured: {formatResourceLabel(selectedDestination.featuredResource)}</span>
                <span>Fish: {selectedDestination.fishName ?? "No fishing stop"}</span>
              </div>
              <div className="zombtrain-stop-actions">
                <button type="button" className="primary-button" onClick={() => handleTravel(selectedDestination)}>Take the train here</button>
                <button type="button" className="secondary-button zombtrain-secondary-button" onClick={handleForage}>Forage this stop</button>
                <button type="button" className="secondary-button zombtrain-secondary-button" onClick={handleMine}>Mine / salvage</button>
              </div>
            </div>
          </div>

          <div className="zombtrain-panel">
            <div className="zombtrain-panel__head">
              <h2>Train home</h2>
              <span>Customization, comfort, and upgrades all live here.</span>
            </div>
            <div className="zombtrain-train-card" style={{ ["--zt-shell" as string]: palettePreview.shell, ["--zt-trim" as string]: palettePreview.trim }}>
              <div className="zombtrain-train-card__window" />
              <div className="zombtrain-train-card__window" />
              <div className="zombtrain-train-card__window" />
              <div className="zombtrain-train-card__details">
                <span>Lantern glow {save.train.lanternGlow}%</span>
                <span>{save.train.plantCount} plants</span>
                <span>{save.train.quiltPattern} quilt</span>
              </div>
            </div>
            <div className="zombtrain-palette-row">
              {(["ember", "sage", "cream", "night"] as ZombTrainTrainPalette[]).map((palette) => {
                const preview = getPalettePreview(palette);
                return (
                  <button
                    key={palette}
                    type="button"
                    className={`zombtrain-palette ${save.train.palette === palette ? "is-selected" : ""}`}
                    onClick={() => handlePaletteChange(palette)}
                    style={{ ["--zt-palette-shell" as string]: preview.shell, ["--zt-palette-trim" as string]: preview.trim }}
                  >
                    {palette}
                  </button>
                );
              })}
            </div>
            <div className="zombtrain-upgrades">
              {ZOMBTRAIN_UPGRADES.map((upgrade) => (
                <button key={upgrade.key} type="button" className={`zombtrain-upgrade ${save.upgrades.includes(upgrade.key) ? "is-owned" : ""}`} onClick={() => handleUpgradePurchase(upgrade.key)}>
                  <strong>{upgrade.name}</strong>
                  <span>{upgrade.description}</span>
                  <small>{save.upgrades.includes(upgrade.key) ? "Installed" : `${upgrade.cost} coins`}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="zombtrain-panel">
            <div className="zombtrain-panel__head">
              <h2>Work loop</h2>
              <span>Fish, gather, sell, then pour the money back into the railcar.</span>
            </div>
            <div className="zombtrain-action-row">
              <button type="button" className="primary-button" onClick={handleFishingStart}>Start fishing minigame</button>
              <button type="button" className="secondary-button zombtrain-secondary-button" onClick={handleSellBox}>Load sell box</button>
              <button type="button" className="secondary-button zombtrain-secondary-button" onClick={() => addResource("bait", 2, "You traded gossip and got two fresh cups of bait.")}>Get bait</button>
            </div>
            <div className="zombtrain-fishing-card">
              <div className="zombtrain-fishing-card__sidebar">
                <span>{currentDestination.fishName ?? "Railwater perch"}</span>
                <strong>{fishing.phase === "playing" ? `${fishing.timer.toFixed(1)}s` : "Ready to cast"}</strong>
                <small>Hold the button to lift the green bar. Keep it on the fish to fill the meter.</small>
              </div>
              <div className="zombtrain-fishing-meter">
                <div className="zombtrain-fishing-meter__water" />
                <div className="zombtrain-fishing-meter__target" style={{ bottom: `${fishing.fishY}%` }} />
                <button
                  type="button"
                  className="zombtrain-fishing-meter__bobber"
                  style={{ bottom: `${fishing.bobberY}%` }}
                  onMouseDown={() => setFishing((current) => ({ ...current, holdActive: true }))}
                  onMouseUp={() => setFishing((current) => ({ ...current, holdActive: false }))}
                  onMouseLeave={() => setFishing((current) => ({ ...current, holdActive: false }))}
                  onTouchStart={() => setFishing((current) => ({ ...current, holdActive: true }))}
                  onTouchEnd={() => setFishing((current) => ({ ...current, holdActive: false }))}
                >
                  Hold
                </button>
              </div>
              <div className="zombtrain-catch-progress">
                <div className="zombtrain-catch-progress__bar" style={{ width: `${fishing.catchProgress}%` }} />
              </div>
            </div>
            <div className="zombtrain-action-row">
              <button type="button" className="secondary-button zombtrain-secondary-button" onClick={restartFishing}>Recast</button>
              <button type="button" className="secondary-button zombtrain-secondary-button" onClick={() => setActiveView("train")}>Head back inside</button>
            </div>
            <div className="zombtrain-inventory">
              {(Object.entries(save.inventory) as Array<[ZombTrainResourceKey, number]>).map(([resource, amount]) => (
                <div key={resource} className="zombtrain-inventory__item">
                  <span>{formatResourceLabel(resource)}</span>
                  <strong>{amount}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="zombtrain-panel">
            <div className="zombtrain-panel__head">
              <h2>Design direction</h2>
              <span>What the existing repo taught us about building this cleanly.</span>
            </div>
            <ul className="zombtrain-notes">
              <li>Use React for menus, inventory, route selection, and cozy upgrade surfaces.</li>
              <li>Use Phaser islands where motion sells the fantasy, starting with the train title scene.</li>
              <li>Keep progression and save data outside the renderer so future gathering maps stay modular.</li>
              <li>Treat combat as occasional pressure, not the default emotional tone of the game.</li>
              <li>The loop is now in place: choose stop, gather, fish, sell, upgrade, repeat.</li>
            </ul>
            <div className="zombtrain-journal">
              {save.journal.map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ZombTrain;
