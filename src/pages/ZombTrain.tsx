import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import {
  formatFishRarity,
  formatResourceLabel,
  getDestinationById,
  getFishByDestination,
  getFishById,
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
  fishTargetY: number;
  fishDecisionTimer: number;
  barY: number;
  barVelocity: number;
  progress: number;
  slip: number;
  timeLeft: number;
  contact: boolean;
  active: boolean;
  caught: boolean;
  resolved: boolean;
  failReason: "time" | "slipped" | null;
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
  const holdingCastRef = useRef(false);
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
    if (screen !== "fishing") {
      holdingCastRef.current = false;
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      holdingCastRef.current = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      holdingCastRef.current = false;
    };

    const handleBlur = () => {
      holdingCastRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [screen]);

  useEffect(() => {
    if (!fishing?.active) return;

    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const delta = Math.min(32, time - lastTime);
      const frame = delta / 16.6667;
      lastTime = time;

      setFishing((current) => {
        if (!current?.active) return current;

        const panic = current.slip > 68 || current.timeLeft < 7;
        let nextDecisionTimer = current.fishDecisionTimer - delta;
        let nextTargetY = current.fishTargetY;

        if (nextDecisionTimer <= 0) {
          nextTargetY = pickFishTarget(current.fish, current.fishY, panic);
          nextDecisionTimer = getFishDecisionWindow(current.fish, panic);
        }

        const sway =
          Math.sin(time / 1000 * (current.fish.speed * 1.35) + current.id) *
          (1.2 + current.fish.difficulty * 0.45);
        const desiredFishY = clampValue(nextTargetY + sway, 8, 92);
        const nextFishY = approachValue(current.fishY, desiredFishY, current.fish.pull * frame);

        let nextBarVelocity =
          current.barVelocity + (holdingCastRef.current ? -0.082 : 0.052) * frame;
        nextBarVelocity *= holdingCastRef.current ? 0.952 : 0.978;
        nextBarVelocity = clampValue(nextBarVelocity, -1.04, 1.12);

        let nextBarY = clampValue(current.barY + nextBarVelocity * frame, 4, 96);
        if ((nextBarY === 4 && nextBarVelocity < 0) || (nextBarY === 96 && nextBarVelocity > 0)) {
          nextBarVelocity = 0;
        }

        const distance = Math.abs(nextFishY - nextBarY);
        const nextContact = distance <= current.fish.catchWindow;
        const nextProgress = clampValue(
          current.progress + (nextContact ? current.fish.catchRate : -current.fish.progressLoss) * frame,
          0,
          100
        );
        const nextSlip = clampValue(
          current.slip + (nextContact ? -current.fish.slipRecover : current.fish.slipRate) * frame,
          0,
          100
        );
        const nextTimeLeft = Math.max(0, current.timeLeft - delta / 1000);

        if (nextProgress >= 100) {
          return {
            ...current,
            fishY: nextFishY,
            fishTargetY: nextTargetY,
            fishDecisionTimer: nextDecisionTimer,
            barY: nextBarY,
            barVelocity: nextBarVelocity,
            progress: 100,
            slip: nextSlip,
            timeLeft: nextTimeLeft,
            contact: true,
            active: false,
            caught: true,
            failReason: null
          };
        }

        if (nextSlip >= 100) {
          return {
            ...current,
            fishY: nextFishY,
            fishTargetY: nextTargetY,
            fishDecisionTimer: nextDecisionTimer,
            barY: nextBarY,
            barVelocity: nextBarVelocity,
            progress: nextProgress,
            slip: 100,
            timeLeft: nextTimeLeft,
            contact: false,
            active: false,
            caught: false,
            failReason: "slipped"
          };
        }

        if (nextTimeLeft <= 0) {
          return {
            ...current,
            fishY: nextFishY,
            fishTargetY: nextTargetY,
            fishDecisionTimer: nextDecisionTimer,
            barY: nextBarY,
            barVelocity: nextBarVelocity,
            progress: nextProgress,
            slip: nextSlip,
            timeLeft: 0,
            contact: false,
            active: false,
            caught: false,
            failReason: "time"
          };
        }

        return {
          ...current,
          fishY: nextFishY,
          fishTargetY: nextTargetY,
          fishDecisionTimer: nextDecisionTimer,
          barY: nextBarY,
          barVelocity: nextBarVelocity,
          progress: nextProgress,
          slip: nextSlip,
          timeLeft: nextTimeLeft,
          contact: nextContact
        };
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [fishing?.active]);

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
    } else if (fishing.failReason === "slipped") {
      setStatus(`${fishing.fish.name} slipped the line. Cast again and keep pressure on it.`);
    } else {
      setStatus(`You ran out of time on ${fishing.fish.name}. Cast again when you are ready.`);
    }
    setFishing((current) => current ? { ...current, resolved: true } : current);
  }, [fishing, save]);
  const currentDestination = save ? getDestinationById(save.currentStopId) : getDestinationById("stillwater-pond");
  const availableFish = useMemo(() => getFishByDestination("stillwater-pond"), []);

  if (!save) {
    return null;
  }

  const inventoryRows = [
    ...availableFish.map((fish) => ({
      key: `fish:${fish.id}` as SellItemKey,
      name: fish.name,
      detail: `${formatFishRarity(fish.rarity)} / ${fish.value} each`,
      count: save.fishInventory[fish.id]
    })),
    { key: "resource:wood" as SellItemKey, name: "Pine Lumber", detail: "8 each", count: save.inventory.wood },
    { key: "resource:ore" as SellItemKey, name: "Iron Ore", detail: "14 each", count: save.inventory.ore },
    { key: "resource:scrap" as SellItemKey, name: "Rail Scrap", detail: "9 each", count: save.inventory.scrap },
    { key: "resource:herbs" as SellItemKey, name: "Stillwater Herbs", detail: "6 each", count: save.inventory.herbs }
  ];

  const sellBoxValue = Object.entries(sellBox).reduce((total, [key, amount]) => total + getItemValue(key as SellItemKey) * amount, 0);

  function setView(next: Screen) {
    holdingCastRef.current = false;
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
    holdingCastRef.current = false;
    setFishing({
      id: nextFishingIdRef.current++,
      fish,
      fishY: randomBetween(30, 68),
      fishTargetY: randomBetween(24, 76),
      fishDecisionTimer: getFishDecisionWindow(fish, false),
      barY: 52,
      barVelocity: 0,
      progress: 18,
      slip: 0,
      timeLeft: 30 + (4 - fish.difficulty) * 2.75,
      contact: false,
      active: true,
      caught: false,
      resolved: false,
      failReason: null
    });
    setScreen("fishing");
    setStatus(`Casting for ${fish.name}. Feather the reel and do not let it shake free.`);
  }

  function castAgain() {
    startFishing();
  }

  function startHolding() {
    if (screen !== "fishing" || !fishing?.active) return;
    holdingCastRef.current = true;
  }

  function stopHolding() {
    holdingCastRef.current = false;
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
            <div className="zombtrain-title-stage">
                <img
                  className="zombtrain-title-stage__bg"
                  src={`${import.meta.env.BASE_URL}assets/zombtrain/backgroundfortrainfinal.png`}
                  alt=""
                />
              <img
                className="zombtrain-title-stage__train"
                src={`${import.meta.env.BASE_URL}assets/zombtrain/train.png`}
                alt="Animated train"
              />
            </div>
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
              <div className="zombtrain-location-card__train">
                <img
                  className="zombtrain-location-card__train-img"
                  src={`${import.meta.env.BASE_URL}assets/zombtrain/train.png`}
                  alt="Train"
                />
              </div>
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
                  <small>{fish.temperament}</small>
                  <p>{fish.description}</p>
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

            <div
              className={`zombtrain-fishing-shell is-${fishing.fish.rarity} ${fishing.contact ? "is-contact" : ""} ${
                fishing.slip > 72 ? "is-danger" : ""
              } ${!fishing.active && fishing.caught ? "is-caught" : ""} ${
                !fishing.active && !fishing.caught ? "is-lost" : ""
              }`}
            >
              <div className="zombtrain-fishing-scene">
                <div className="zombtrain-fishing-summary">
                  <div className="zombtrain-fishing-summary__title">
                    <span className={`zombtrain-rarity-pill is-${fishing.fish.rarity}`}>
                      {formatFishRarity(fishing.fish.rarity)}
                    </span>
                    <h3>{fishing.fish.name}</h3>
                    <p>{fishing.fish.description}</p>
                  </div>
                  <div className="zombtrain-fishing-summary__stats">
                    <div className="zombtrain-fishing-stat">
                      <span>Sell value</span>
                      <strong>{fishing.fish.value} rail bucks</strong>
                    </div>
                    <div className="zombtrain-fishing-stat">
                      <span>Temperament</span>
                      <strong>{fishing.fish.temperament}</strong>
                    </div>
                    <div className="zombtrain-fishing-stat">
                      <span>Status</span>
                      <strong>{getFishingStateLabel(fishing)}</strong>
                    </div>
                  </div>
                </div>

                <div className="zombtrain-fishing-play">
                  <div
                    className="zombtrain-fishing-meter-wrap"
                    onPointerDown={startHolding}
                    onPointerUp={stopHolding}
                    onPointerLeave={stopHolding}
                    onPointerCancel={stopHolding}
                  >
                    <div className="zombtrain-fishing-meter">
                      <div className="zombtrain-fishing-meter__glow" />
                      <div className="zombtrain-fishing-meter__foam" />
                      <span className="zombtrain-fishing-meter__label zombtrain-fishing-meter__label--top">Shallows</span>
                      <span className="zombtrain-fishing-meter__label zombtrain-fishing-meter__label--mid">Midwater</span>
                      <span className="zombtrain-fishing-meter__label zombtrain-fishing-meter__label--bottom">Deep</span>

                      <div
                        className={`zombtrain-fishing-fish is-${fishing.fish.rarity} ${fishing.contact ? "is-hooked" : ""}`}
                        style={{ bottom: `${fishing.fishY}%`, height: `${fishing.fish.spriteHeight}px` }}
                      >
                        <span className="zombtrain-fishing-fish__tail" />
                        <span className="zombtrain-fishing-fish__body" />
                        <span className="zombtrain-fishing-fish__eye" />
                      </div>

                      <div
                        className={`zombtrain-fishing-bar ${holdingCastRef.current ? "is-reeling" : ""} ${
                          fishing.contact ? "is-contact" : ""
                        }`}
                        style={{ bottom: `${fishing.barY}%` }}
                      >
                        <span className="zombtrain-fishing-bar__core" />
                      </div>

                      <div
                        className={`zombtrain-fishing-burst ${fishing.contact ? "is-live" : ""}`}
                        style={{ bottom: `${fishing.barY}%` }}
                      />

                      {fishing.slip > 72 && <div className="zombtrain-fishing-warning">Line slipping</div>}
                    </div>
                  </div>

                  <div className="zombtrain-fishing-control-panel">
                    <div className="zombtrain-fishing-meter-card">
                      <div className="zombtrain-fishing-meter-card__head">
                        <span>Catch</span>
                        <strong>{Math.round(fishing.progress)}%</strong>
                      </div>
                      <div className="zombtrain-fishing-progress">
                        <div className="zombtrain-fishing-progress__fill" style={{ width: `${fishing.progress}%` }} />
                      </div>
                    </div>

                    <div className="zombtrain-fishing-meter-card is-alert">
                      <div className="zombtrain-fishing-meter-card__head">
                        <span>Escape</span>
                        <strong>{Math.round(fishing.slip)}%</strong>
                      </div>
                      <div className="zombtrain-fishing-progress is-danger">
                        <div className="zombtrain-fishing-progress__fill" style={{ width: `${fishing.slip}%` }} />
                      </div>
                    </div>

                    <div className="zombtrain-fishing-meter-card">
                      <div className="zombtrain-fishing-meter-card__head">
                        <span>Time left</span>
                        <strong>{fishing.timeLeft.toFixed(1)}s</strong>
                      </div>
                    </div>

                    <p className="zombtrain-fishing-instruction">
                      Tap or feather the hold so the hook zone floats with the fish. If you lose it too long, it breaks free.
                    </p>

                    <button
                      type="button"
                      className="zombtrain-reel-button"
                      onPointerDown={startHolding}
                      onPointerUp={stopHolding}
                      onPointerLeave={stopHolding}
                      onPointerCancel={stopHolding}
                    >
                      {fishing.active ? "Hold to Reel" : fishing.caught ? "Fish landed" : "Fish lost"}
                    </button>

                    <p className="zombtrain-fishing-controls-note">You can also hold Space.</p>
                  </div>
                </div>
              </div>
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
        <p className="score-display">Rail bucks: {save.inventory.coins} â€¢ Bait: {save.inventory.bait} â€¢ Lumber: {save.inventory.wood} â€¢ Ore: {save.inventory.ore}</p>
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


function getFishDecisionWindow(fish: ZombTrainFishDefinition, panic: boolean) {
  const base = 1120 - fish.difficulty * 135 - fish.speed * 80;
  const jitter = randomBetween(0, 220);
  return Math.max(panic ? 250 : 360, base + jitter - (panic ? 180 : 0));
}

function pickFishTarget(fish: ZombTrainFishDefinition, currentY: number, panic: boolean) {
  let nextTarget = randomBetween(16, 84);

  if (fish.id === "softshell-bluegill") {
    if (Math.random() < 0.55) nextTarget = randomBetween(28, 70);
  }

  if (fish.id === "glassfin-carp") {
    if (Math.random() < 0.5) nextTarget = randomBetween(40, 62);
    if (Math.random() < 0.18) nextTarget = nextTarget > currentY ? randomBetween(16, 28) : randomBetween(72, 84);
  }

  if (fish.id === "lantern-koi") {
    if (Math.random() < 0.42) nextTarget = currentY < 50 ? randomBetween(62, 84) : randomBetween(16, 38);
  }

  if (fish.id === "moon-eel") {
    if (Math.random() < 0.5) nextTarget = currentY < 50 ? randomBetween(68, 88) : randomBetween(12, 30);
    if (Math.random() < 0.24) nextTarget = randomBetween(34, 66);
  }

  if (panic) {
    nextTarget = currentY < 50 ? randomBetween(64, 88) : randomBetween(12, 36);
  }

  return clampValue(nextTarget, 10, 90);
}

function getFishingStateLabel(fishing: FishingRun) {
  if (!fishing.active) {
    return fishing.caught ? "Caught" : fishing.failReason === "slipped" ? "Escaped" : "Time up";
  }
  if (fishing.contact && fishing.slip < 20) return "Locked in";
  if (fishing.contact) return "Steady pressure";
  if (fishing.slip > 72) return "Breaking free";
  if (fishing.slip > 40) return "Losing it";
  return "Tracking";
}

function approachValue(current: number, target: number, step: number) {
  if (Math.abs(target - current) <= step) {
    return target;
  }
  return current + Math.sign(target - current) * step;
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}
export default ZombTrain;
