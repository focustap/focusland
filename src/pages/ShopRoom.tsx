import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import AvatarSprite from "../components/AvatarSprite";
import {
  createAvatarRender,
  getStoredAvatarCustomization,
  loadAvatarSpriteSheet,
  normalizeAvatarCustomization,
  storeAvatarCustomization,
  TOWN_AVATAR_SCALE,
  updateAvatarRender,
  type AvatarCustomization,
  type AvatarRender
} from "../lib/avatarSprites";
import { getCurrentUserGold, applyGoldDelta } from "../lib/progression";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { createRoomPresenceController, ROOM_NAMES, type RoomPresenceController } from "../lib/roomPresenceController";
import {
  addCardPack,
  loadShopState,
  ownsSkin,
  saveShopState,
  SHOP_PACK_PRODUCTS,
  SHOP_SKIN_PRODUCTS,
  unlockSkin,
  type ShopPackProduct,
  type ShopSkinProduct,
  type ShopState
} from "../lib/shop";
import { supabase } from "../lib/supabase";

type Hotspot = {
  route: string;
  x: number;
  y: number;
  width: number;
  height: number;
  entranceX: number;
  entranceY: number;
};

const panelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.78)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 16,
  padding: 16
};

const ShopRoom: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const assetBase = import.meta.env.BASE_URL;
  const [gold, setGold] = useState(0);
  const [shopState, setShopState] = useState<ShopState>(() => loadShopState());
  const [avatarCustomization, setAvatarCustomization] = useState<AvatarCustomization>(getStoredAvatarCustomization());
  const [status, setStatus] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const ownedPackSummary = useMemo(
    () =>
      SHOP_PACK_PRODUCTS.filter((pack) => (shopState.cardPacks[pack.id] ?? 0) > 0)
        .map((pack) => `${pack.name} x${shopState.cardPacks[pack.id]}`)
        .join(", "),
    [shopState.cardPacks]
  );

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_customization")
        .eq("id", session.user.id)
        .maybeSingle();

      const nextCustomization = normalizeAvatarCustomization(
        (profile as { avatar_customization?: Partial<AvatarCustomization> | null } | null)?.avatar_customization
        ?? getStoredAvatarCustomization()
      );
      const nextGold = await getCurrentUserGold();
      const nextShopState = loadShopState(nextCustomization.skinId);

      if (cancelled) {
        return;
      }

      storeAvatarCustomization(nextCustomization);
      setAvatarCustomization(nextCustomization);
      setGold(nextGold);
      setShopState(nextShopState);
    };

    void loadState();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    let isUnmounted = false;
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const width = 780;
      const height = 500;
      let localAvatarCustomization = getStoredAvatarCustomization();
      let profileColor = DEFAULT_PROFILE_COLOR;
      let username: string | null = null;
      let userId: string | null = null;

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session) {
        userId = session.user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        profileColor = normalizeProfileColor((profile?.color as string | null) ?? DEFAULT_PROFILE_COLOR);
        username = (profile?.username as string | null) ?? session.user.email ?? null;
        localAvatarCustomization = normalizeAvatarCustomization(
          (profile as { avatar_customization?: Partial<AvatarCustomization> | null } | null)?.avatar_customization
          ?? localAvatarCustomization
        );
      }

      if (isUnmounted || !containerRef.current) {
        return;
      }

      class ShopScene extends Phaser.Scene {
        player!: AvatarRender;
        targetX: number | null = null;
        targetY: number | null = null;
        pendingRoute: string | null = null;
        hotspots: Hotspot[] = [];
        roomPresence?: RoomPresenceController;

        preload() {
          loadAvatarSpriteSheet(this, assetBase);
        }

        create() {
          this.cameras.main.setBackgroundColor("#1f1608");
          this.add.rectangle(width / 2, height / 2, width, height, 0x2a1d0d);
          this.add.rectangle(width / 2, 106, width - 64, 168, 0x5b3b13).setStrokeStyle(3, 0xfbbf24, 0.7);
          this.add.rectangle(210, 238, 184, 96, 0x0f766e, 0.28).setStrokeStyle(2, 0x5eead4, 0.9);
          this.add.rectangle(570, 238, 184, 96, 0x7c2d12, 0.28).setStrokeStyle(2, 0xfdba74, 0.9);
          this.add.rectangle(width / 2, height - 84, width - 120, 120, 0x3f2a12);
          this.add.text(width / 2, 34, "Focusland Shop", {
            color: "#fde68a",
            fontSize: "28px",
            fontStyle: "bold"
          }).setOrigin(0.5);
          this.add.text(210, 214, "Skin Stall", {
            color: "#ecfeff",
            fontSize: "24px",
            fontStyle: "bold"
          }).setOrigin(0.5);
          this.add.text(570, 214, "Card Packs", {
            color: "#fff7ed",
            fontSize: "24px",
            fontStyle: "bold"
          }).setOrigin(0.5);
          this.add.text(width / 2, 114, "Spend gold on skins and packs. More inventory can plug in here later.", {
            color: "#fef3c7",
            fontSize: "16px"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/lobby",
            x: 84,
            y: height - 78,
            width: 92,
            height: 116,
            entranceX: 84,
            entranceY: height - 118
          });

          this.add.rectangle(84, height - 78, 92, 116, 0x1f4d3c, 0.32).setStrokeStyle(2, 0x86efac, 0.72);
          this.add.text(84, height - 18, "Town", {
            color: "#dcfce7",
            fontSize: "15px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.player = createAvatarRender(this, width / 2, height - 90, localAvatarCustomization, 12, TOWN_AVATAR_SCALE);
          if (userId) {
            this.roomPresence = createRoomPresenceController({
              scene: this,
              roomName: ROOM_NAMES.shop,
              userId,
              username,
              profileColor,
              getLocalPosition: () => ({ x: this.player.container.x, y: this.player.container.y })
            });
          }

          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            this.targetX = pointer.x;
            this.targetY = Phaser.Math.Clamp(pointer.y, 56, height - 22);
            this.pendingRoute = null;

            for (const hotspot of this.hotspots) {
              const bounds = new Phaser.Geom.Rectangle(
                hotspot.x - hotspot.width / 2,
                hotspot.y - hotspot.height / 2,
                hotspot.width,
                hotspot.height
              );
              if (bounds.contains(pointer.x, pointer.y)) {
                this.targetX = hotspot.entranceX;
                this.targetY = hotspot.entranceY;
                this.pendingRoute = hotspot.route;
                break;
              }
            }
          });
        }

        update(_time: number, delta: number) {
          this.roomPresence?.animate();

          if (this.targetX == null || this.targetY == null) {
            return;
          }

          const dx = this.targetX - this.player.container.x;
          const dy = this.targetY - this.player.container.y;
          const distance = Math.hypot(dx, dy);
          const step = (230 * delta) / 1000;

          if (distance <= step) {
            this.player.container.setPosition(this.targetX, this.targetY - 18);
            updateAvatarRender(this.player, localAvatarCustomization, "front", false);
            const route = this.pendingRoute;
            this.targetX = null;
            this.targetY = null;
            this.pendingRoute = null;
            if (route) {
              navigate(route);
            }
            return;
          }

          const nextX = Phaser.Math.Clamp(this.player.container.x + (dx / distance) * step, 18, width - 18);
          const nextY = Phaser.Math.Clamp(this.player.container.y + (dy / distance) * step, 38, height - 40);
          this.player.container.setPosition(nextX, nextY);
          updateAvatarRender(
            this.player,
            localAvatarCustomization,
            Math.abs(dx) > Math.abs(dy)
              ? dx < 0
                ? "left"
                : "right"
              : dy < 0
                ? "back"
                : "front",
            true
          );
        }
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width,
        height,
        parent: containerRef.current,
        physics: {
          default: "arcade",
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
          }
        },
        scene: ShopScene
      });

      gameRef.current = game;
      cleanup = () => {
        game.destroy(true);
        gameRef.current = null;
      };
    };

    void setup();

    return () => {
      isUnmounted = true;
      cleanup?.();
    };
  }, [navigate, assetBase]);

  const handleSkinPurchase = async (product: ShopSkinProduct) => {
    if (ownsSkin(shopState, product.skinId)) {
      setStatus(`${product.name} is already unlocked.`);
      return;
    }

    if (gold < product.price) {
      setStatus(`Not enough gold for ${product.name}.`);
      return;
    }

    setBusyItemId(product.id);
    setStatus(null);
    try {
      const nextGold = await applyGoldDelta(-product.price);
      const nextState = unlockSkin(shopState, product.skinId);
      saveShopState(nextState);
      setShopState(nextState);
      setGold(nextGold);
      setStatus(`${product.name} unlocked.`);
    } catch {
      setStatus(`Could not buy ${product.name}.`);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleEquipSkin = async (product: ShopSkinProduct) => {
    if (!ownsSkin(shopState, product.skinId)) {
      setStatus(`Buy ${product.name} before equipping it.`);
      return;
    }

    setBusyItemId(product.id);
    setStatus(null);
    try {
      const nextCustomization = normalizeAvatarCustomization({ ...avatarCustomization, skinId: product.skinId });
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/login");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_customization: nextCustomization })
        .eq("id", session.user.id);

      if (error) {
        throw error;
      }

      storeAvatarCustomization(nextCustomization);
      setAvatarCustomization(nextCustomization);
      const nextState = loadShopState(nextCustomization.skinId);
      saveShopState(nextState);
      setShopState(nextState);
      setStatus(`${product.name} equipped.`);
    } catch {
      setStatus(`Could not equip ${product.name}.`);
    } finally {
      setBusyItemId(null);
    }
  };

  const handlePackPurchase = async (product: ShopPackProduct) => {
    if (gold < product.price) {
      setStatus(`Not enough gold for ${product.name}.`);
      return;
    }

    setBusyItemId(product.id);
    setStatus(null);
    try {
      const nextGold = await applyGoldDelta(-product.price);
      const nextState = addCardPack(shopState, product.id);
      saveShopState(nextState);
      setShopState(nextState);
      setGold(nextGold);
      setStatus(`${product.name} added to your stash.`);
    } catch {
      setStatus(`Could not buy ${product.name}.`);
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 980 }}>
        <h2>Shop</h2>
        <p>Walk into the shop, then use your gold below to unlock skins and stock up on TapDeck packs.</p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: 780, margin: "1rem auto" }} />
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <section style={panelStyle}>
            <strong>Wallet</strong>
            <p style={{ margin: "0.5rem 0" }}>Gold: {gold}</p>
            <p style={{ margin: "0.5rem 0" }}>
              Equipped skin: {SHOP_SKIN_PRODUCTS.find((product) => product.skinId === avatarCustomization.skinId)?.name ?? "Abigail"}
            </p>
            <p style={{ margin: 0 }}>
              Packs owned: {ownedPackSummary || "None yet"}
            </p>
          </section>
          <section style={panelStyle}>
            <strong>Status</strong>
            <p style={{ margin: "0.5rem 0 0" }}>{status ?? "The shop is open."}</p>
          </section>
        </div>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: 16 }}>
          <section style={panelStyle}>
            <h3 style={{ marginTop: 0 }}>Skins</h3>
            {SHOP_SKIN_PRODUCTS.map((product) => {
              const unlocked = ownsSkin(shopState, product.skinId);
              const equipped = avatarCustomization.skinId === product.skinId;
              return (
                <div key={product.id} style={{ borderTop: "1px solid rgba(148, 163, 184, 0.18)", paddingTop: 12, marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <AvatarSprite customization={{ skinId: product.skinId }} size={56} />
                    <div>
                      <strong>{product.name}</strong>
                      <p style={{ margin: "0.25rem 0" }}>{product.description}</p>
                      <span>{product.price} gold</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={unlocked || busyItemId === product.id}
                      onClick={() => {
                        void handleSkinPurchase(product);
                      }}
                    >
                      {unlocked ? "Unlocked" : busyItemId === product.id ? "Working..." : "Buy"}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!unlocked || equipped || busyItemId === product.id}
                      onClick={() => {
                        void handleEquipSkin(product);
                      }}
                    >
                      {equipped ? "Equipped" : "Equip"}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
          <section style={panelStyle}>
            <h3 style={{ marginTop: 0 }}>Card Packs</h3>
            {SHOP_PACK_PRODUCTS.map((product) => (
              <div key={product.id} style={{ borderTop: "1px solid rgba(148, 163, 184, 0.18)", paddingTop: 12, marginTop: 12 }}>
                <strong>{product.name}</strong>
                <p style={{ margin: "0.25rem 0" }}>{product.description}</p>
                <p style={{ margin: "0.25rem 0" }}>
                  {product.price} gold
                  {" · "}
                  Owned: {shopState.cardPacks[product.id] ?? 0}
                </p>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busyItemId === product.id}
                  onClick={() => {
                    void handlePackPurchase(product);
                  }}
                >
                  {busyItemId === product.id ? "Working..." : "Buy pack"}
                </button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ShopRoom;
