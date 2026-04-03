import React, { useEffect, useMemo, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import {
  formatFishRarity,
  formatResourceLabel,
  getDestinationById,
  getFishByDestination,
  getFishById,
  getPalettePreview,
  loadZombTrainSave,
  resetZombTrainSave,
  saveZombTrainSave,
  type ZombTrainDestinationId,
  type ZombTrainFishDefinition,
  type ZombTrainFishId,
  type ZombTrainSave
} from "../lib/zombTrain";

type Screen = "title" | "train" | "venture" | "store" | "location" | "fishing";
type SellItemKey =
  | `fish:${ZombTrainFishId}`
  | "resource:wood"
  | "resource:ore"
  | "resource:scrap"
  | "resource:herbs";

type DraggableTrainItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
};

type FishingRun = {
  id: number;
  fish: ZombTrainFishDefinition;
  fishY: number;
  barY: number;
  velocity: number;
  progress: number;
  timeLeft: number;
  active: boolean;
  caught: boolean;
  resolved: boolean;
};

const DEFAULT_TRAIN_ITEMS: DraggableTrainItem[] = [
  { id: "plant", label: "Plant", x: 86, y: 76, color: "#6fa76f" },
  { id: "crate", label: "Crate", x: 332, y: 182, color: "#9b7249" },
  { id: "lamp", label: "Lamp", x: 230, y: 54, color: "#efc87f" }
];

const DEFAULT_SELL_BOX: Record<SellItemKey, number> = {
  "fish:glassfin-carp": 0,
  "fish:softshell-bluegill": 0,
  "fish:lantern-koi": 0,
  "fish:moon-eel": 0,
  "resource:wood": 0,
  "resource:ore": 0,
  "resource:scrap": 0,
  "resource:herbs": 0
};

const ZombTrain: React.FC = () => {
  const [save, setSave] = useState<ZombTrainSave | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [selectedDestinationId, setSelectedDestinationId] = useState<ZombTrainDestinationId>("stillwater-pond");
  const [trainItems, setTrainItems] = useState(DEFAULT_TRAIN_ITEMS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [sellBox, setSellBox] = useState(DEFAULT_SELL_BOX);
  const [status, setStatus] = useState("The line is quiet and the wheels never stop.");
  const [fishing, setFishing] = useState<FishingRun | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const titleGameRef = useRef<Phaser.Game | null>(null);
  const nextFishingIdRef = useRef(1);

  useEffect(() => {
    const loaded = loadZombTrainSave();
    setSave(loaded);
    setSelectedDestinationId(loaded.selectedDestinationId);
  }, []);

  useEffect(() => {
    if (!save) return;
    saveZombTrainSave(save);
  }, [save]);

  useEffect(() => {
    if (screen !== "title" || !titleRef.current || titleGameRef.current) return;

    class TitleScene extends Phaser.Scene {
      train!: Phaser.GameObjects.Container;
      drift = 0;

      create() {
        const width = 900;
        const height = 340;
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x142230, 0x203a4f, 0x33473f, 0x1a2522, 1);
        bg.fillRect(0, 0, width, height);
        this.add.ellipse(742, 70, 154, 54, 0xf5d6a2, 0.86);
        this.add.ellipse(742, 70, 220, 84, 0xf5d6a2, 0.12);
        for (let i = 0; i < 10; i += 1) {
          const y = 90 + i * 26;
          this.add.rectangle(width / 2, y, 980, 6, 0x4d392f, 0.85).setAngle(0);
        }
        this.add.rectangle(width / 2, 208, 1040, 12, 0xc3b09b, 1);
        this.add.rectangle(width / 2, 248, 1040, 12, 0xc3b09b, 1);
        for (let i = 0; i < 20; i += 1) {
          this.add.rectangle(40 + i * 44, 228, 18, 62, 0x5f4737, 1);
        }

        this.train = this.add.container(220, 196, [
          this.add.ellipse(0, 20, 190, 58, 0x050809, 0.24),
          this.add.rectangle(0, 0, 168, 80, 0x5f7e65, 1).setStrokeStyle(6, 0xefe5c6, 0.95),
          this.add.rectangle(-18, -14, 80, 42, 0xefe5c6, 1).setStrokeStyle(3, 0x344239, 0.45),
          this.add.rectangle(42, 4, 48, 56, 0x7d4a34, 1).setStrokeStyle(3, 0xefe5c6, 0.7),
          this.add.circle(-56, -10, 12, 0xf5d18a, 1),
          this.add.circle(-50, 28, 16, 0x171717, 1).setStrokeStyle(4, 0x737373, 1),
          this.add.circle(46, 28, 16, 0x171717, 1).setStrokeStyle(4, 0x737373, 1)
        ]);
      }

      update(_time: number, delta: number) {
        this.drift += delta * 0.0011;
        this.train.x = 220 + ((this.drift * 160) % 1040);
        this.train.y = 196 + Math.sin(this.drift * 6) * 3;
        if (this.train.x > 980) {
          this.train.x = -120;
        }
      }
    }

    titleGameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 900,
      height: 340,
      parent: titleRef.current,
      backgroundColor: "#0d1518",
      scene: TitleScene,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
    });

    return () => {
      titleGameRef.current?.destroy(true);
      titleGameRef.current = null;
    };
  }, [screen]);

  useEffect(() => {
    if (!fishing?.active || !save) return;

    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const delta = Math.min(32, time - lastTime);
      lastTime = time;

      setFishing((current) => {
        if (!current?.active) return current;
        const t = time / 1000;
        const nextFishY = 50 + Math.sin(t * current.fish.speed * 1.25) * 22 + Math.sin(t * (current.fish.speed + 0.75) * 1.9) * 10;
        const centerBand = Math.abs(current.barY - 50) < 11;
        const holdLift = centerBand ? -0.07 : -0.055;
        const fallLift = centerBand ? 0.052 : 0.04;
        const nextVelocity = Phaser.Math.Clamp(
          current.velocity + (holdingCastRef.current ? holdLift : fallLift),
          -1.45,
          1.45
        );
        const nextBarY = Phaser.Math.Clamp(current.barY + nextVelocity, 8, 92);
        const distance = Math.abs(nextFishY - nextBarY);
        const progressDelta = distance < current.fish.barSize / 2 ? 0.045 * delta : -0.07 * delta;
        const nextProgress = Phaser.Math.Clamp(current.progress + progressDelta, 0, 100);
        const nextTimeLeft = Math.max(0, current.timeLeft - delta / 1000);

        if (nextProgress >= 100) {
          return { ...current, fishY: nextFishY, barY: nextBarY, velocity: nextVelocity, progress: 100, timeLeft: nextTimeLeft, active: false, caught: true };
        }
        if (nextTimeLeft <= 0) {
          return { ...current, fishY: nextFishY, barY: nextBarY, velocity: nextVelocity, progress: nextProgress, timeLeft: 0, active: false, caught: false };
        }

        return { ...current, fishY: nextFishY, barY: nextBarY, velocity: nextVelocity, progress: nextProgress, timeLeft: nextTimeLeft };
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [fishing?.active, save]);

  useEffect(() => {
    if (!fishing || !save || fishing.active || fishing.resolved) return;
    if (fishing.caught) {
      setSave({
        ...save,
        fishInventory: {
          ...save.fishInventory,
          [fishing.fish.id]: save.fishInventory[fishing.fish.id] + 1
        }
      });
      setStatus(`Caught ${fishing.fish.name}. ${formatFishRarity(fishing.fish.rarity)} fish sell for ${fishing.fish.value} rail bucks.`);
    } else {
      setStatus("The fish got away. Cast again when you're ready.");
    }
    setFishing((current) => current ? { ...current, resolved: true } : current);
  }, [fishing, save]);

  const holdingCastRef = useRef(false);
  const currentDestination = save ? getDestinationById(save.currentStopId) : getDestinationById("stillwater-pond");
  const availableFish = useMemo(() => getFishByDestination("stillwater-pond"), []);

  if (!save) {
    return null;
  }

  const inventoryRows = [
    ...availableFish.map((fish) => ({
      key: `fish:${fish.id}` as SellItemKey,
      name: fish.name,
      detail: `${formatFishRarity(fish.rarity)} • ${fish.value} each`,
      count: save.fishInventory[fish.id]
    })),
    { key: "resource:wood" as SellItemKey, name: "Pine Lumber", detail: "8 each", count: save.inventory.wood },
    { key: "resource:ore" as SellItemKey, name: "Iron Ore", detail: "14 each", count: save.inventory.ore },
    { key: "resource:scrap" as SellItemKey, name: "Rail Scrap", detail: "9 each", count: save.inventory.scrap },
    { key: "resource:herbs" as SellItemKey, name: "Stillwater Herbs", detail: "6 each", count: save.inventory.herbs }
  ];

  const sellBoxValue = Object.entries(sellBox).reduce((total, [key, amount]) => total + getItemValue(key as SellItemKey) * amount, 0);

  function setView(next: Screen) {
    setScreen(next);
    if (next === "venture") setStatus("Plan the next stop.");
    if (next === "store") setStatus("Everything here sells for in-game rail bucks only.");
    if (next === "train") setStatus("The train is your home between ventures.");
  }

  function travelTo(destinationId: ZombTrainDestinationId) {
    const destination = getDestinationById(destinationId);
    setSave({
      ...save,
      selectedDestinationId: destinationId,
      currentStopId: destinationId,
      day: save.day + 1
    });
    setScreen("location");
    setStatus(`The train pulled into ${destination.name}.`);
  }

  function startFishing() {
    const fish = rollFish(availableFish);
    setFishing({
      id: nextFishingIdRef.current++,
      fish,
      fishY: 50,
      barY: 50,
      velocity: 0,
      progress: 10,
      timeLeft: 26 + (4 - fish.difficulty) * 2,
      active: true,
      caught: false,
      resolved: false
    });
    setScreen("fishing");
    setStatus(`Casting for ${fish.name}. Harder fish pay more.`);
  }

  function castAgain() {
    startFishing();
  }

  function handleShiftAdd(key: SellItemKey) {
    if (!canMoveToSellBox(key, save, sellBox)) return;
    moveToSellBox(key, 1);
  }

  function moveToSellBox(key: SellItemKey, amount: number) {
    if (amount <= 0 || !canMoveToSellBox(key, save, sellBox, amount)) return;
    setSellBox((current) => ({ ...current, [key]: current[key] + amount }));
  }

  function sellNow() {
    if (sellBoxValue <= 0) {
      setStatus("The sell box is empty.");
      return;
    }

    const nextSave: ZombTrainSave = {
      ...save,
      inventory: {
        ...save.inventory,
        coins: save.inventory.coins + sellBoxValue,
        wood: save.inventory.wood - sellBox["resource:wood"],
        ore: save.inventory.ore - sellBox["resource:ore"],
        scrap: save.inventory.scrap - sellBox["resource:scrap"],
        herbs: save.inventory.herbs - sellBox["resource:herbs"]
      },
      fishInventory: {
        "glassfin-carp": save.fishInventory["glassfin-carp"] - sellBox["fish:glassfin-carp"],
        "softshell-bluegill": save.fishInventory["softshell-bluegill"] - sellBox["fish:softshell-bluegill"],
        "lantern-koi": save.fishInventory["lantern-koi"] - sellBox["fish:lantern-koi"],
        "moon-eel": save.fishInventory["moon-eel"] - sellBox["fish:moon-eel"]
      }
    };

    setSave(nextSave);
    setSellBox(DEFAULT_SELL_BOX);
    setStatus(`Sold the box for ${sellBoxValue} rail bucks.`);
  }

  return (
    <div className="page">
      <NavBar />
      <div className="content card zombtrain-v2-shell">
        <h2>ZombTrain</h2>
        <p className="zombtrain-v2-copy">Current focus: proper title flow, train/venture/store structure, and a working fish-and-sell loop using in-game currency only.</p>

        {screen === "title" && (
          <section className="zombtrain-title-screen">
            <div ref={titleRef} className="zombtrain-title-stage" />
            <div className="zombtrain-title-overlay">
              <h1>ZombTrain</h1>
              <p>The train keeps moving. You decide what the next stop is for.</p>
              <div className="zombtrain-title-actions">
                <button type="button" className="primary-button" onClick={() => setView("train")}>TO TRAIN</button>
                <button type="button" className="primary-button" onClick={() => setView("venture")}>VENTURE</button>
                <button type="button" className="primary-button" onClick={() => setView("store")}>STORE</button>
              </div>
            </div>
          </section>
        )}

        {screen === "train" && (
          <section className="zombtrain-panel-screen">
            <div className="zombtrain-toolbar">
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("title")}>Back to title</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("venture")}>Go venture</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("store")}>Open store</button>
            </div>
            <div className="zombtrain-train-room">
              <div className="zombtrain-train-board">
                <strong>Route board</strong>
                <span>{getDestinationById(selectedDestinationId).name}</span>
              </div>
              <div className="zombtrain-train-bed">Bunk</div>
              <div className="zombtrain-train-workbench">Workbench</div>
              {trainItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`zombtrain-train-item ${draggingId === item.id ? "is-dragging" : ""}`}
                  style={{ left: item.x, top: item.y, background: item.color }}
                  onMouseDown={() => setDraggingId(item.id)}
                  onMouseUp={() => setDraggingId(null)}
                  onMouseMove={(event) => {
                    if (draggingId !== item.id) return;
                    const rect = (event.currentTarget.parentElement as HTMLDivElement).getBoundingClientRect();
                    const x = Math.max(14, Math.min(rect.width - 74, event.clientX - rect.left - 28));
                    const y = Math.max(14, Math.min(rect.height - 74, event.clientY - rect.top - 22));
                    setTrainItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, x, y } : entry));
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="info">Drag the train items around to rough in customization. We can turn this into proper furniture placement next.</p>
          </section>
        )}

        {screen === "venture" && (
          <section className="zombtrain-panel-screen">
            <div className="zombtrain-toolbar">
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("title")}>Back to title</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("train")}>To train</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("store")}>Store</button>
            </div>
            <div className="zombtrain-venture-map">
              <button type="button" className="zombtrain-location-node is-active" onClick={() => travelTo("stillwater-pond")}>
                <strong>Stillwater Pond</strong>
                <span>Fishing stop</span>
                <small>Available now</small>
              </button>
              <div className="zombtrain-location-node is-coming">More routes soon</div>
            </div>
          </section>
        )}

        {screen === "location" && (
          <section className="zombtrain-panel-screen">
            <div className="zombtrain-toolbar">
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("train")}>Back to train</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("store")}>Store</button>
            </div>
            <div className="zombtrain-location-card">
              <div className="zombtrain-location-card__pond" />
              <div className="zombtrain-location-card__train">Train</div>
              <div className="zombtrain-location-card__copy">
                <h3>{currentDestination.name}</h3>
                <p>{currentDestination.vibe}</p>
                <button type="button" className="primary-button" onClick={startFishing}>Start fishing</button>
              </div>
            </div>
            <div className="zombtrain-fish-list">
              {availableFish.map((fish) => (
                <div key={fish.id} className={`zombtrain-fish-card is-${fish.rarity}`}>
                  <strong>{fish.name}</strong>
                  <span>{formatFishRarity(fish.rarity)}</span>
                  <small>{fish.value} rail bucks</small>
                </div>
              ))}
            </div>
          </section>
        )}

        {screen === "fishing" && fishing && (
          <section className="zombtrain-panel-screen">
            <div className="zombtrain-toolbar">
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("location")}>Back to pond</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={castAgain}>Cast again</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("store")}>Store</button>
            </div>
            <div className="zombtrain-fishing-shell">
              <div className="zombtrain-fishing-info">
                <h3>{fishing.fish.name}</h3>
                <p>{formatFishRarity(fishing.fish.rarity)} fish • {fishing.fish.value} rail bucks</p>
                <p>Harder fish move faster and give you a smaller catch window.</p>
                <button
                  type="button"
                  className="primary-button"
                  onMouseDown={() => { holdingCastRef.current = true; }}
                  onMouseUp={() => { holdingCastRef.current = false; }}
                  onMouseLeave={() => { holdingCastRef.current = false; }}
                  onTouchStart={() => { holdingCastRef.current = true; }}
                  onTouchEnd={() => { holdingCastRef.current = false; }}
                >
                  Hold To Reel
                </button>
                <button type="button" className="secondary-button zombtrain-tab" onClick={castAgain}>Cast Again</button>
              </div>
              <div className="zombtrain-fishing-meter">
                <div className="zombtrain-fishing-fish" style={{ bottom: `${fishing.fishY}%`, height: `${fishing.fish.barSize}px` }} />
                <div className="zombtrain-fishing-bar" style={{ bottom: `${fishing.barY}%` }} />
              </div>
              <div className="zombtrain-fishing-progress">
                <div className="zombtrain-fishing-progress__fill" style={{ width: `${fishing.progress}%` }} />
              </div>
              <p className="score-display">{fishing.active ? `${fishing.timeLeft.toFixed(1)}s left` : fishing.caught ? "Caught it." : "Missed it."}</p>
            </div>
          </section>
        )}

        {screen === "store" && (
          <section className="zombtrain-panel-screen">
            <div className="zombtrain-toolbar">
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("title")}>Back to title</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("train")}>To train</button>
              <button type="button" className="secondary-button zombtrain-tab" onClick={() => setView("venture")}>Venture</button>
            </div>
            <div className="zombtrain-store-grid">
              <div className="zombtrain-store-panel">
                <h3>Inventory</h3>
                <p>Drag items into the sell box, or shift-click to add one.</p>
                <div className="zombtrain-store-list">
                  {inventoryRows.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="zombtrain-store-item"
                      draggable={item.count > 0}
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.key)}
                      onClick={(event) => {
                        if (!event.shiftKey) return;
                        handleShiftAdd(item.key);
                      }}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.detail}</span>
                      <small>x{item.count}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="zombtrain-store-panel zombtrain-sell-box"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const key = event.dataTransfer.getData("text/plain") as SellItemKey;
                  handleShiftAdd(key);
                }}
              >
                <h3>Sell Box</h3>
                <div className="zombtrain-store-list">
                  {Object.entries(sellBox).filter(([, count]) => count > 0).map(([key, count]) => (
                    <div key={key} className="zombtrain-store-item is-sell">
                      <strong>{formatSellKey(key as SellItemKey)}</strong>
                      <span>{getItemValue(key as SellItemKey)} each</span>
                      <small>x{count}</small>
                    </div>
                  ))}
                  {sellBoxValue === 0 && <p className="info">Drop items here.</p>}
                </div>
                <p className="score-display">Total: {sellBoxValue} rail bucks</p>
                <button type="button" className="primary-button" onClick={sellNow}>Sell</button>
              </div>
            </div>
          </section>
        )}

        <p className="info">{status}</p>
        <p className="score-display">Rail bucks: {save.inventory.coins} • Bait: {save.inventory.bait} • Lumber: {save.inventory.wood} • Ore: {save.inventory.ore}</p>
        <button type="button" className="secondary-button zombtrain-reset-button" onClick={() => {
          const reset = resetZombTrainSave();
          setSave(reset);
          setScreen("title");
          setSelectedDestinationId(reset.selectedDestinationId);
          setSellBox(DEFAULT_SELL_BOX);
          setFishing(null);
          setStatus("Fresh save loaded.");
        }}>
          Reset save
        </button>
      </div>
    </div>
  );
};

function getItemValue(key: SellItemKey) {
  if (key.startsWith("fish:")) {
    return getFishById(key.replace("fish:", "") as ZombTrainFishId).value;
  }
  if (key === "resource:wood") return 8;
  if (key === "resource:ore") return 14;
  if (key === "resource:scrap") return 9;
  if (key === "resource:herbs") return 6;
  return 0;
}

function canMoveToSellBox(key: SellItemKey, save: ZombTrainSave, sellBox: Record<SellItemKey, number>, amount = 1) {
  if (key.startsWith("fish:")) {
    const fishId = key.replace("fish:", "") as ZombTrainFishId;
    return save.fishInventory[fishId] - sellBox[key] >= amount;
  }
  const resourceKey = key.replace("resource:", "") as "wood" | "ore" | "scrap" | "herbs";
  return save.inventory[resourceKey] - sellBox[key] >= amount;
}

function formatSellKey(key: SellItemKey) {
  if (key.startsWith("fish:")) {
    return getFishById(key.replace("fish:", "") as ZombTrainFishId).name;
  }
  return formatResourceLabel(key.replace("resource:", "") as "wood" | "ore" | "scrap" | "herbs");
}

function rollFish(pool: ZombTrainFishDefinition[]) {
  const roll = Math.random();
  if (roll > 0.985) return pool.find((fish) => fish.rarity === "legendary") ?? pool[pool.length - 1];
  if (roll > 0.9) return pool.find((fish) => fish.rarity === "rare") ?? pool[pool.length - 1];
  if (roll > 0.62) return pool.find((fish) => fish.rarity === "uncommon") ?? pool[1];
  return pool.find((fish) => fish.rarity === "common") ?? pool[0];
}

export default ZombTrain;
