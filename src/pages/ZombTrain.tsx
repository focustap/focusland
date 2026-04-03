import React, { useEffect, useMemo, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import {
  createAvatarRender,
  getStoredAvatarCustomization,
  loadAvatarSpriteSheet,
  normalizeAvatarCustomization,
  TOWN_AVATAR_SCALE,
  updateAvatarRender,
  type AvatarCustomization,
  type AvatarFacing,
  type AvatarRender
} from "../lib/avatarSprites";
import {
  DEFAULT_ZOMBTRAIN_SAVE,
  ZOMBTRAIN_DESTINATIONS,
  ZOMBTRAIN_UPGRADES,
  getDestinationById,
  getPalettePreview,
  loadZombTrainSave,
  resetZombTrainSave,
  saveZombTrainSave,
  type ZombTrainDestinationId,
  type ZombTrainSave,
  type ZombTrainTrainUpgradeKey,
  type ZombTrainView
} from "../lib/zombTrain";

type SceneMode = "title" | "location" | "train" | "fishing";
type HotspotId = "route-board" | "train-door" | "pond" | "sell-crate" | "salvage" | "woods" | "paint" | "upgrade" | "sleep" | "exit";
type Hotspot = { id: HotspotId; label: string; x: number; y: number; radius: number; prompt: string };

const TRAIN_HOTSPOTS: Hotspot[] = [
  { id: "route-board", label: "Route Board", x: 360, y: 130, radius: 58, prompt: "Pick the next destination" },
  { id: "paint", label: "Paint Shelf", x: 148, y: 132, radius: 54, prompt: "Switch paint colors" },
  { id: "upgrade", label: "Workbench", x: 276, y: 406, radius: 62, prompt: "Install upgrades" },
  { id: "sleep", label: "Bunk", x: 596, y: 130, radius: 76, prompt: "Rest and settle the nerves" },
  { id: "exit", label: "Railcar Door", x: 728, y: 270, radius: 70, prompt: "Head back outside" }
];

const VIEW_FROM_MODE: Record<SceneMode, ZombTrainView> = {
  title: "title",
  location: "map",
  train: "train",
  fishing: "fishing"
};

const MODE_FROM_VIEW: Record<ZombTrainView, SceneMode> = {
  title: "title",
  map: "location",
  train: "train",
  fishing: "fishing"
};

function getLocationHotspots(destinationId: ZombTrainDestinationId): Hotspot[] {
  const common: Hotspot[] = [
    { id: "train-door", label: "Parked Train", x: 650, y: 300, radius: 96, prompt: "Board the train and head back inside" },
    { id: "sell-crate", label: "Sell Crate", x: 690, y: 434, radius: 52, prompt: "Ship your haul for coins" }
  ];

  switch (destinationId) {
    case "stillwater-pond":
      return [
        ...common,
        { id: "pond", label: "Stillwater Pond", x: 180, y: 380, radius: 90, prompt: "Fish for dinner" },
        { id: "woods", label: "Reed Bank", x: 148, y: 156, radius: 74, prompt: "Gather herbs and bait" }
      ];
    case "pinewatch-woods":
      return [
        ...common,
        { id: "woods", label: "Pine Edge", x: 150, y: 210, radius: 94, prompt: "Gather wood and herbs" },
        { id: "pond", label: "Creek Pool", x: 250, y: 430, radius: 72, prompt: "Fish the creek" }
      ];
    case "iron-hollow":
      return [
        ...common,
        { id: "salvage", label: "Mine Entrance", x: 194, y: 260, radius: 88, prompt: "Mine ore and pull scrap" }
      ];
    case "sunset-market":
      return [
        ...common,
        { id: "sell-crate", label: "Market Stall", x: 248, y: 260, radius: 76, prompt: "Trade goods for better prices" },
        { id: "woods", label: "Supply Cart", x: 194, y: 424, radius: 66, prompt: "Pick up bait and herbs" }
      ];
    default:
      return common;
  }
}

const ZombTrain: React.FC = () => {
  const [save, setSave] = useState<ZombTrainSave>(DEFAULT_ZOMBTRAIN_SAVE);
  const [status, setStatus] = useState("A cozier apocalypse starts with a good train.");
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const saveRef = useRef<ZombTrainSave>(DEFAULT_ZOMBTRAIN_SAVE);
  const avatarRef = useRef<AvatarCustomization>(normalizeAvatarCustomization(getStoredAvatarCustomization()));

  useEffect(() => {
    const loadedSave = loadZombTrainSave();
    setSave(loadedSave);
    saveRef.current = loadedSave;
    avatarRef.current = normalizeAvatarCustomization(getStoredAvatarCustomization());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveRef.current = save;
    saveZombTrainSave(save);
  }, [loaded, save]);

  useEffect(() => {
    if (!loaded || !containerRef.current || gameRef.current) return;

    const helpers = {
      getSave: () => saveRef.current,
      getAvatar: () => avatarRef.current,
      patchSave: (updater: (current: ZombTrainSave) => ZombTrainSave) =>
        setSave((current) => {
          const next = updater(current);
          saveRef.current = next;
          return next;
        }),
      setStatus: (message: string) => setStatus(message)
    };

    class ZombTrainScene extends Phaser.Scene {
      mode: SceneMode = MODE_FROM_VIEW[helpers.getSave().activeView];
      player: AvatarRender | null = null;
      targetX: number | null = null;
      targetY: number | null = null;
      currentHotspot: HotspotId | null = null;
      header!: Phaser.GameObjects.Text;
      subheader!: Phaser.GameObjects.Text;
      hint!: Phaser.GameObjects.Text;
      drift = 0;
      titleTrain!: Phaser.GameObjects.Container;
      fishingFish = 240;
      fishingBar = 260;
      fishingVelocity = 0;
      fishingCatch = 28;
      fishingTimer = 18;
      holdingCast = false;
      selectedUpgradeIndex = 0;
      selectedDestinationId: ZombTrainDestinationId = helpers.getSave().selectedDestinationId;

      preload() {
        loadAvatarSpriteSheet(this, import.meta.env.BASE_URL);
      }

      create() {
        this.header = this.add.text(20, 18, "", { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "16px", color: "#fff4df" }).setDepth(40);
        this.subheader = this.add.text(20, 42, "", { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "13px", color: "#d6d1c2" }).setDepth(40);
        this.hint = this.add.text(798, 18, "", { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "13px", color: "#fff4df", align: "right" }).setOrigin(1, 0).setDepth(40);

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (this.mode === "title") {
            this.enterMode("train");
            helpers.setStatus("You step through the railcar door and into the moving home.");
            return;
          }
          if (this.mode === "fishing") {
            this.holdingCast = true;
            return;
          }
          if (!this.player) return;
          this.targetX = pointer.worldX;
          this.targetY = pointer.worldY;
        });
        this.input.on("pointerup", () => { this.holdingCast = false; });
        this.input.keyboard?.on("keydown-E", () => this.handleInteract());
        this.input.keyboard?.on("keydown-ENTER", () => this.handleInteract());
        this.input.keyboard?.on("keydown-SPACE", () => { this.holdingCast = true; });
        this.input.keyboard?.on("keyup-SPACE", () => { this.holdingCast = false; });
        this.input.keyboard?.on("keydown-ESC", () => {
          if (this.mode === "location" || this.mode === "fishing") {
            this.enterMode("train");
            helpers.setStatus("Back inside the train.");
          }
        });
        this.input.keyboard?.on("keydown-LEFT", () => { if (this.mode === "train") this.cycleDestination(-1); });
        this.input.keyboard?.on("keydown-RIGHT", () => { if (this.mode === "train") this.cycleDestination(1); });
        this.input.keyboard?.on("keydown-UP", () => { if (this.mode === "train") { this.selectedUpgradeIndex = Phaser.Math.Wrap(this.selectedUpgradeIndex - 1, 0, ZOMBTRAIN_UPGRADES.length); this.renderMode(); } });
        this.input.keyboard?.on("keydown-DOWN", () => { if (this.mode === "train") { this.selectedUpgradeIndex = Phaser.Math.Wrap(this.selectedUpgradeIndex + 1, 0, ZOMBTRAIN_UPGRADES.length); this.renderMode(); } });

        this.renderMode();
      }

      enterMode(mode: SceneMode) {
        this.mode = mode;
        helpers.patchSave((current) => ({ ...current, activeView: VIEW_FROM_MODE[mode] }));
        this.renderMode();
      }

      renderMode() {
        this.children.removeAll();
        this.add.existing(this.header);
        this.add.existing(this.subheader);
        this.add.existing(this.hint);
        this.player = null;
        this.targetX = null;
        this.targetY = null;
        this.currentHotspot = null;

        if (this.mode === "title") this.renderTitle();
        else if (this.mode === "location") this.renderLocation();
        else if (this.mode === "train") this.renderTrain();
        else this.renderFishing();

        this.syncHud();
      }

      syncHud(message?: string) {
        const save = helpers.getSave();
        const destination = getDestinationById(save.currentStopId);
        this.header.setText(`ZombTrain  Day ${save.day}  Cozy ${save.cozyMeter}%  Danger ${save.dangerMeter}%  Coins ${save.inventory.coins}`);
        this.subheader.setText(
          message ?? (
            this.mode === "title"
              ? "Click to start."
              : this.mode === "location"
                ? `${destination.name}: walk up to a hotspot and press E.`
                : this.mode === "train"
                  ? "Train hub: route board, upgrades, sleep, and style all live in here."
                  : "Hold Space or the mouse to keep the bar on the fish."
          )
        );
        this.hint.setText(
          this.mode === "title"
            ? "Click"
            : this.mode === "location"
              ? "Move: click  Interact: E  Return: Esc"
              : this.mode === "train"
                ? "Move: click  Interact: E  Route: arrows"
                : "Hold Space / mouse  Exit: Esc"
        );
      }

      renderTitle() {
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x132726, 0x294642, 0x435a55, 0x1a2728, 1);
        bg.fillRect(0, 0, 820, 560);
        for (let i = 0; i < 10; i += 1) {
          const y = 70 + i * 52;
          this.add.rectangle(410, y, 680, 8, 0x4f3b2f, 0.8).setAngle(28);
        }
        this.add.rectangle(410, 280, 760, 14, 0xb8a18e, 1).setAngle(28);
        this.add.rectangle(410, 314, 760, 14, 0xb8a18e, 1).setAngle(28);
        this.titleTrain = this.add.container(230, 236, [
          this.add.ellipse(0, 0, 184, 86, 0x051111, 0.25),
          this.add.rectangle(0, 0, 164, 80, 0x5f7e65, 1).setStrokeStyle(6, 0xefe5c6, 0.9),
          this.add.rectangle(-16, -4, 74, 38, 0xefe5c6, 1).setStrokeStyle(3, 0x2f4136, 0.4),
          this.add.rectangle(38, 2, 48, 52, 0x7f4b34, 1).setStrokeStyle(3, 0xefe5c6, 0.7),
          this.add.circle(-56, -6, 12, 0xf8d48b, 1),
          this.add.circle(-44, 26, 14, 0x1d1d1d, 1).setStrokeStyle(4, 0x6d6d6d, 1),
          this.add.circle(44, 26, 14, 0x1d1d1d, 1).setStrokeStyle(4, 0x6d6d6d, 1)
        ]).setAngle(28);
        this.add.rectangle(410, 108, 430, 122, 0x081212, 0.48).setStrokeStyle(2, 0xf5d8a4, 0.4);
        this.add.text(410, 86, "ZombTrain", { fontFamily: "Georgia, serif", fontSize: "44px", color: "#fff4df", fontStyle: "bold" }).setOrigin(0.5);
        this.add.text(410, 126, "Top-down cozy survival on the rails", { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "18px", color: "#ead4b0" }).setOrigin(0.5);
        this.add.text(410, 454, "Click anywhere to board the train", { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "18px", color: "#fff4df" }).setOrigin(0.5);
      }

      renderLocation() {
        const save = helpers.getSave();
        const destination = getDestinationById(save.currentStopId);
        const palette = getPalettePreview(save.train.palette);
        const shell = Phaser.Display.Color.HexStringToColor(palette.shell).color;
        const trim = Phaser.Display.Color.HexStringToColor(palette.trim).color;

        const sky = this.add.graphics();
        sky.fillGradientStyle(0x769995, 0x8db1ab, 0x49635a, 0x28413c, 1);
        sky.fillRect(0, 0, 820, 560);
        const ground = this.add.graphics();
        ground.fillStyle(destination.id === "iron-hollow" ? 0x585148 : 0x3f5e48, 1);
        ground.fillRect(0, 120, 820, 440);
        ground.fillStyle(destination.id === "sunset-market" ? 0x856449 : 0x567b5c, 1);
        ground.fillRect(0, 350, 820, 210);

        if (destination.id === "stillwater-pond") {
          this.add.ellipse(180, 380, 238, 150, 0x4f8ba2, 0.95).setStrokeStyle(6, 0xa5e3dd, 0.6);
          this.add.circle(110, 160, 62, 0x2b4b34, 1);
          this.add.circle(168, 196, 58, 0x34563a, 1);
          this.add.circle(78, 214, 46, 0x3e6545, 1);
        } else if (destination.id === "pinewatch-woods") {
          this.add.circle(150, 210, 94, 0x27452f, 1);
          this.add.circle(236, 228, 72, 0x31563a, 1);
          this.add.circle(106, 282, 64, 0x3d6948, 1);
          this.add.ellipse(250, 430, 164, 88, 0x4f8ba2, 0.95).setStrokeStyle(6, 0xa5e3dd, 0.5);
        } else if (destination.id === "iron-hollow") {
          this.add.circle(206, 260, 112, 0x3b342e, 1).setStrokeStyle(8, 0x8b7a6a, 0.55);
          this.add.rectangle(148, 406, 94, 58, 0x6d5645, 1).setAngle(-8).setStrokeStyle(4, 0xb48b66, 0.75);
          this.add.rectangle(246, 446, 110, 64, 0x5f493b, 1).setAngle(6).setStrokeStyle(4, 0xb48b66, 0.75);
        } else if (destination.id === "sunset-market") {
          this.add.rectangle(248, 260, 132, 110, 0x7f583a, 1).setStrokeStyle(5, 0xf0c783, 0.8);
          this.add.rectangle(194, 424, 92, 64, 0x6d5645, 1).setStrokeStyle(4, 0xb48b66, 0.75);
          this.add.rectangle(304, 404, 106, 72, 0x8b6b41, 1).setStrokeStyle(4, 0xf0c783, 0.7);
        }

        this.add.rectangle(690, 434, 74, 64, 0x8b6b41, 1).setStrokeStyle(4, 0xf0c783, 0.85);
        this.add.rectangle(650, 300, 248, 116, shell, 1).setStrokeStyle(6, trim, 0.95);
        this.add.rectangle(616, 272, 102, 54, trim, 1).setStrokeStyle(3, 0x21382f, 0.35);
        this.add.rectangle(714, 300, 86, 86, 0x7a4a33, 1).setStrokeStyle(4, trim, 0.75);
        this.add.circle(554, 300, 18, 0xf8d48b, 1);
        this.add.rectangle(644, 286, 50, 76, 0x1b1916, 0.72);
        this.add.circle(590, 346, 18, 0x1b1b1b, 1).setStrokeStyle(5, 0x707070, 1);
        this.add.circle(710, 346, 18, 0x1b1b1b, 1).setStrokeStyle(5, 0x707070, 1);
        this.add.rectangle(412, 86, 318, 56, 0x081212, 0.45).setStrokeStyle(2, 0xffe1ad, 0.28);
        this.add.text(412, 74, destination.name, { fontFamily: "Georgia, serif", fontSize: "24px", color: "#fff4df", fontStyle: "bold" }).setOrigin(0.5);
        this.add.text(412, 96, destination.vibe, { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "12px", color: "#e7d6b5" }).setOrigin(0.5);

        this.player = createAvatarRender(this, 560, 336, helpers.getAvatar(), 24, TOWN_AVATAR_SCALE);
      }

      renderTrain() {
        const save = helpers.getSave();
        const palette = getPalettePreview(save.train.palette);
        const shell = Phaser.Display.Color.HexStringToColor(palette.shell).color;
        const upgrade = ZOMBTRAIN_UPGRADES[this.selectedUpgradeIndex];
        const owned = save.upgrades.includes(upgrade.key);

        const floor = this.add.graphics();
        floor.fillGradientStyle(0x8e6c4e, 0x7b5b40, 0x6a4e37, 0x5e442f, 1);
        floor.fillRect(0, 0, 820, 560);
        this.add.rectangle(410, 280, 420, 220, 0x4b6f64, 0.62).setStrokeStyle(6, 0xe7d4ad, 0.55);
        this.add.rectangle(410, 40, 820, 80, shell, 1);
        this.add.rectangle(37, 280, 74, 560, shell, 1);
        this.add.rectangle(783, 280, 74, 560, shell, 1);
        this.add.rectangle(410, 523, 820, 74, shell, 1);
        this.add.circle(410, 94, 90, 0xf6ce85, save.train.lanternGlow / 260);
        this.add.circle(410, 94, 22, 0xf6ce85, 1);
        this.add.rectangle(150, 132, 110, 104, 0x5d4431, 1).setStrokeStyle(4, 0xf2ddbb, 0.6);
        this.add.rectangle(360, 130, 120, 96, 0x6f5238, 1).setStrokeStyle(4, 0xf7deae, 0.85);
        this.add.rectangle(276, 408, 150, 106, 0x4e3828, 1).setStrokeStyle(4, 0xf2ddbb, 0.6);
        this.add.rectangle(598, 132, 170, 102, 0xcab18d, 1).setStrokeStyle(4, 0xeedfb8, 0.7);
        this.add.rectangle(730, 270, 82, 144, 0x271d18, 0.88).setStrokeStyle(4, 0xf0debc, 0.7);
        this.add.rectangle(560, 404, 218, 108, 0x0a1213, 0.55).setStrokeStyle(2, 0xf0debc, 0.2);
        this.add.text(360, 120, "Routes", { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "16px", color: "#fff4df", fontStyle: "bold" }).setOrigin(0.5);
        this.add.text(360, 146, getDestinationById(save.selectedDestinationId).name, { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "13px", color: "#e7d6b5" }).setOrigin(0.5);
        this.add.text(462, 368, `Workbench: ${upgrade.name}`, { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "16px", color: "#fff4df", fontStyle: "bold", wordWrap: { width: 180 } });
        this.add.text(462, 394, upgrade.description, { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "13px", color: "#dacdaf", wordWrap: { width: 188 } });
        this.add.text(462, 446, owned ? "Installed" : `${upgrade.cost} coins`, { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "14px", color: owned ? "#9be8b0" : "#f5d18f" });
        this.add.text(410, 42, "Inside the ZombTrain", { fontFamily: "Georgia, serif", fontSize: "24px", color: "#fff4df", fontStyle: "bold" }).setOrigin(0.5);
        this.player = createAvatarRender(this, 664, 306, helpers.getAvatar(), 24, TOWN_AVATAR_SCALE);
      }

      renderFishing() {
        const destination = getDestinationById(helpers.getSave().currentStopId);
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x27454a, 0x3f6b6d, 0x1b2f37, 0x122128, 1);
        bg.fillRect(0, 0, 820, 560);
        this.add.ellipse(250, 292, 320, 232, 0x4f8ba2, 0.95).setStrokeStyle(8, 0xace7de, 0.5);
        this.add.rectangle(248, 432, 210, 42, 0x7a5a3e, 1).setStrokeStyle(4, 0xc8a57b, 0.6);
        this.add.text(546, 82, destination.fishName ?? "Stillwater fish", { fontFamily: "Georgia, serif", fontSize: "24px", color: "#fff4df", fontStyle: "bold" });
        this.add.text(546, 118, "Keep the green bar on the fish to fill the catch meter.", { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "13px", color: "#dacdaf", wordWrap: { width: 220 } });
        this.add.rectangle(628, 288, 54, 360, 0x0b1618, 0.65).setStrokeStyle(2, 0xf0debc, 0.2);
        this.add.rectangle(628, this.fishingFish, 36, 40, 0x87dc86, 0.48).setStrokeStyle(2, 0xbaf1bc, 0.8);
        this.add.rectangle(628, this.fishingBar, 42, 54, 0xf6ce85, 1).setStrokeStyle(2, 0xfff4df, 0.65);
        this.add.rectangle(628, 500, 160, 18, 0x0b1618, 0.6).setStrokeStyle(2, 0xf0debc, 0.2);
        this.add.rectangle(550, 500, this.fishingCatch * 1.52, 12, 0x87dc86, 1).setOrigin(0, 0.5);
        this.add.text(548, 154, `Time ${this.fishingTimer.toFixed(1)}s`, { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "18px", color: "#fff4df" });
        this.add.text(546, 470, "Esc to stop fishing", { fontFamily: "\"Trebuchet MS\", system-ui, sans-serif", fontSize: "13px", color: "#dacdaf" });
      }

      cycleDestination(direction: number) {
        const currentIndex = ZOMBTRAIN_DESTINATIONS.findIndex((destination) => destination.id === this.selectedDestinationId);
        const next = ZOMBTRAIN_DESTINATIONS[Phaser.Math.Wrap(currentIndex + direction, 0, ZOMBTRAIN_DESTINATIONS.length)];
        this.selectedDestinationId = next.id;
        helpers.patchSave((current) => ({ ...current, selectedDestinationId: next.id }));
        helpers.setStatus(`Route board highlighted ${next.name}.`);
      }

      update(_time: number, delta: number) {
        this.drift += delta * 0.0012;
        if (this.mode === "title") {
          this.titleTrain?.setPosition(230 + Math.sin(this.drift * 1.6) * 180, 236 + Math.cos(this.drift * 2.2) * 12);
          return;
        }
        if (this.mode === "fishing") {
          this.updateFishing(delta);
          return;
        }
        this.updateMovement(delta);
        this.updatePrompt();
      }

      updateMovement(delta: number) {
        if (!this.player || this.targetX == null || this.targetY == null) {
          if (this.player) updateAvatarRender(this.player, helpers.getAvatar(), this.player.facing, false);
          return;
        }
        const dx = this.targetX - this.player.container.x;
        const dy = this.targetY - this.player.container.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 8) {
          this.targetX = null;
          this.targetY = null;
          updateAvatarRender(this.player, helpers.getAvatar(), this.player.facing, false);
          return;
        }
        const step = Math.min(distance, (delta / 1000) * 150);
        this.player.container.setPosition(
          Phaser.Math.Clamp(this.player.container.x + (dx / distance) * step, 72, 748),
          Phaser.Math.Clamp(this.player.container.y + (dy / distance) * step, 84, 492)
        );
        const facing: AvatarFacing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "back" : "front");
        updateAvatarRender(this.player, helpers.getAvatar(), facing, true);
      }

      updatePrompt() {
        if (!this.player) return;
        const source = this.mode === "location" ? getLocationHotspots(helpers.getSave().currentStopId) : TRAIN_HOTSPOTS;
        const hotspot = source.find((candidate) => Phaser.Math.Distance.Between(this.player!.container.x, this.player!.container.y, candidate.x, candidate.y) <= candidate.radius);
        this.currentHotspot = hotspot?.id ?? null;
        if (hotspot) this.syncHud(`${hotspot.label}: ${hotspot.prompt}. Press E.`);
        else this.syncHud();
      }

      updateFishing(delta: number) {
        const destination = getDestinationById(helpers.getSave().currentStopId);
        this.fishingFish = 240 + Math.sin(this.drift * 2.1) * 86 + Math.sin(this.drift * 4.8) * 24;
        this.fishingVelocity += (this.holdingCast ? -0.12 : 0.09) * (delta / 16);
        this.fishingVelocity = Phaser.Math.Clamp(this.fishingVelocity, -4.2, 4.2);
        this.fishingBar = Phaser.Math.Clamp(this.fishingBar + this.fishingVelocity, 118, 458);
        this.fishingCatch = Phaser.Math.Clamp(this.fishingCatch + (Math.abs(this.fishingFish - this.fishingBar) < 30 ? 0.22 * delta : -0.18 * delta), 0, 100);
        this.fishingTimer = Math.max(0, this.fishingTimer - delta / 1000);
        this.renderMode();
        if (this.fishingCatch >= 100) {
          helpers.patchSave((current) => ({
            ...current,
            inventory: { ...current.inventory, fish: current.inventory.fish + 1 },
            cozyMeter: Math.min(100, current.cozyMeter + 2)
          }));
          helpers.setStatus(`You caught a ${destination.fishName ?? "fresh fish"}.`);
          this.enterMode("route");
        } else if (this.fishingTimer <= 0 || this.fishingCatch <= 0) {
          helpers.setStatus("The fish got away.");
          this.enterMode("route");
        }
      }

      handleInteract() {
        const save = helpers.getSave();
        if (this.mode === "location") {
          if (this.currentHotspot === "route-board") {
            const destination = getDestinationById(save.selectedDestinationId);
            helpers.patchSave((current) => ({
              ...current,
              currentStopId: destination.id,
              day: current.day + 1,
              cozyMeter: Math.min(100, current.cozyMeter + 3),
              dangerMeter: Math.min(100, current.dangerMeter + (destination.risk === "Medium" ? 7 : 4))
            }));
            helpers.setStatus(`The train rumbles toward ${destination.name}.`);
            this.renderMode();
          } else if (this.currentHotspot === "train-door") {
            this.enterMode("train");
            helpers.setStatus("You step inside the railcar.");
          } else if (this.currentHotspot === "pond") {
            if (save.inventory.bait <= 0) {
              helpers.setStatus("You need bait before you can fish.");
            } else {
              helpers.patchSave((current) => ({ ...current, inventory: { ...current.inventory, bait: current.inventory.bait - 1 } }));
              this.fishingFish = 240;
              this.fishingBar = 260;
              this.fishingVelocity = 0;
              this.fishingCatch = 28;
              this.fishingTimer = 18;
              this.enterMode("fishing");
              helpers.setStatus("Line in the water.");
            }
          } else if (this.currentHotspot === "sell-crate") {
            const total = save.inventory.fish * 12 + save.inventory.wood * 3 + save.inventory.ore * 9 + save.inventory.scrap * 5 + save.inventory.herbs * 4;
            if (total <= 0) helpers.setStatus("The sell crate is empty.");
            else helpers.patchSave((current) => ({
              ...current,
              inventory: { ...current.inventory, coins: current.inventory.coins + total, fish: 0, wood: 0, ore: 0, scrap: 0, herbs: 0 },
              cozyMeter: Math.min(100, current.cozyMeter + 3)
            }));
          } else if (this.currentHotspot === "salvage") {
            helpers.patchSave((current) => ({ ...current, inventory: { ...current.inventory, scrap: current.inventory.scrap + 3, ore: current.inventory.ore + 1 } }));
            helpers.setStatus("You pulled usable scrap and a little ore from the pile.");
          } else if (this.currentHotspot === "woods") {
            helpers.patchSave((current) => ({ ...current, inventory: { ...current.inventory, wood: current.inventory.wood + 4, herbs: current.inventory.herbs + 2, bait: current.inventory.bait + 1 } }));
            helpers.setStatus("You gathered wood, herbs, and bait from the treeline.");
          }
          return;
        }
        if (this.mode === "train") {
          if (this.currentHotspot === "exit") {
            this.enterMode("location");
          } else if (this.currentHotspot === "paint") {
            helpers.patchSave((current) => {
              const palettes = ["sage", "cream", "ember", "night"] as const;
              const index = palettes.findIndex((palette) => palette === current.train.palette);
              return { ...current, train: { ...current.train, palette: palettes[(index + 1) % palettes.length] } };
            });
            helpers.setStatus("Fresh paint for the railcar.");
            this.renderMode();
          } else if (this.currentHotspot === "route-board") {
            const destination = getDestinationById(save.selectedDestinationId);
            helpers.patchSave((current) => ({
              ...current,
              currentStopId: destination.id,
              day: current.day + 1,
              cozyMeter: Math.min(100, current.cozyMeter + 3),
              dangerMeter: Math.min(100, current.dangerMeter + (destination.risk === "Medium" ? 7 : 4))
            }));
            this.enterMode("location");
            helpers.setStatus(`The train pulls into ${destination.name}.`);
          } else if (this.currentHotspot === "sleep") {
            helpers.patchSave((current) => ({ ...current, cozyMeter: Math.min(100, current.cozyMeter + 6), dangerMeter: Math.max(0, current.dangerMeter - 8) }));
            helpers.setStatus("A short rest makes the apocalypse feel further away.");
          } else if (this.currentHotspot === "upgrade") {
            this.buySelectedUpgrade();
          }
        }
      }

      buySelectedUpgrade() {
        const save = helpers.getSave();
        const upgrade = ZOMBTRAIN_UPGRADES[this.selectedUpgradeIndex];
        if (save.upgrades.includes(upgrade.key)) {
          helpers.setStatus(`${upgrade.name} is already installed.`);
          return;
        }
        if (save.inventory.coins < upgrade.cost) {
          helpers.setStatus(`You need ${upgrade.cost - save.inventory.coins} more coins for ${upgrade.name}.`);
          return;
        }
        helpers.patchSave((current) => applyUpgrade(current, upgrade.key));
        helpers.setStatus(`${upgrade.name} installed.`);
        this.renderMode();
      }
    }

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 820,
      height: 560,
      parent: containerRef.current,
      backgroundColor: "#0d1716",
      scene: ZombTrainScene,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [loaded]);

  const currentDestination = useMemo(() => getDestinationById(save.currentStopId), [save.currentStopId]);

  return (
    <div className="page">
      <NavBar />
      <div className="content card zombtrain-game-shell">
        <h2>ZombTrain</h2>
        <p className="zombtrain-game-copy">This version is rebuilt as a top-down game surface first. The route board, train interior, fishing, upgrades, and resource loop now happen in the actual playfield.</p>
        <div ref={containerRef} className="zombtrain-canvas-shell" />
        <p className="info">{status}</p>
        <p className="score-display">Current stop: {currentDestination.name}. Inventory: {save.inventory.coins} coins, {save.inventory.bait} bait, {save.inventory.fish} fish, {save.inventory.wood} wood, {save.inventory.ore} ore.</p>
        <button type="button" className="secondary-button zombtrain-reset-button" onClick={() => {
          const reset = resetZombTrainSave();
          saveRef.current = reset;
          setSave(reset);
          setStatus("Fresh save loaded.");
          gameRef.current?.destroy(true);
          gameRef.current = null;
          setLoaded(false);
          window.setTimeout(() => setLoaded(true), 0);
        }}>
          Reset save
        </button>
      </div>
    </div>
  );
};

function applyUpgrade(current: ZombTrainSave, key: ZombTrainTrainUpgradeKey): ZombTrainSave {
  const upgrade = ZOMBTRAIN_UPGRADES.find((item) => item.key === key);
  if (!upgrade || current.upgrades.includes(key)) return current;
  return {
    ...current,
    inventory: { ...current.inventory, coins: current.inventory.coins - upgrade.cost },
    upgrades: [...current.upgrades, key],
    cozyMeter: Math.min(100, current.cozyMeter + 6),
    train: {
      ...current.train,
      lanternGlow: key === "lanterns" ? Math.min(100, current.train.lanternGlow + 18) : current.train.lanternGlow,
      plantCount: key === "stove" ? Math.min(6, current.train.plantCount + 1) : current.train.plantCount
    }
  };
}

export default ZombTrain;
