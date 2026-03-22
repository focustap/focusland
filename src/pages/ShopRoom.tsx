import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import AvatarSprite from "../components/AvatarSprite";
import PackOpeningOverlay, { type PackOpeningStage } from "../components/shop/PackOpeningOverlay";
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
import { openPack, type PackRevealCard } from "../lib/card-game/packOpening";
import { getCurrentUserGold, applyGoldDelta } from "../lib/progression";
import { loadInventoryForCurrentUser, saveInventoryForCurrentUser } from "../lib/playerInventory";
import { playPackBurstSound, playPackChargeSound, playRevealSound } from "../lib/packOpeningAudio";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { createRoomPresenceController, ROOM_NAMES, type RoomPresenceController } from "../lib/roomPresenceController";
import {
  normalizeCollection,
  normalizeOwnedSkinIds,
  ownsSkin,
  SHOP_PACK_PRODUCTS,
  SHOP_SKIN_PRODUCTS,
  type ShopInventory,
  type ShopPackProduct,
  type ShopSkinProduct
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

type PackSort = "qty" | "name" | "price";

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.88), rgba(30, 41, 59, 0.92))",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 20,
  padding: 18,
  boxShadow: "0 18px 38px rgba(15, 23, 42, 0.18)"
};

const ShopRoom: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const assetBase = import.meta.env.BASE_URL;
  const [gold, setGold] = useState(0);
  const [inventory, setInventory] = useState<ShopInventory>({
    ownedSkinIds: [0],
    unopenedPacks: {},
    cardCollection: {}
  });
  const [avatarCustomization, setAvatarCustomization] = useState<AvatarCustomization>(getStoredAvatarCustomization());
  const [status, setStatus] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [packSort, setPackSort] = useState<PackSort>("qty");
  const [openingPackId, setOpeningPackId] = useState<string | null>(null);
  const [openingCards, setOpeningCards] = useState<PackRevealCard[]>([]);
  const [openingStage, setOpeningStage] = useState<PackOpeningStage>("charging");
  const [revealedCount, setRevealedCount] = useState(0);
  const [inventoryReady, setInventoryReady] = useState(false);

  const openingPack = useMemo(
    () => SHOP_PACK_PRODUCTS.find((product) => product.id === openingPackId) ?? null,
    [openingPackId]
  );

  const ownedPackSummary = useMemo(
    () =>
      SHOP_PACK_PRODUCTS.filter((pack) => (inventory.unopenedPacks[pack.id] ?? 0) > 0)
        .map((pack) => `${pack.name} x${inventory.unopenedPacks[pack.id]}`)
        .join(", "),
    [inventory.unopenedPacks]
  );

  const sortedPacks = useMemo(() => {
    const copy = [...SHOP_PACK_PRODUCTS];
    copy.sort((left, right) => {
      if (packSort === "qty") {
        return (inventory.unopenedPacks[right.id] ?? 0) - (inventory.unopenedPacks[left.id] ?? 0) || left.name.localeCompare(right.name);
      }
      if (packSort === "price") {
        return left.price - right.price || left.name.localeCompare(right.name);
      }
      return left.name.localeCompare(right.name);
    });
    return copy;
  }, [inventory.unopenedPacks, packSort]);

  const collectionSize = useMemo(
    () => Object.values(inventory.cardCollection).reduce((sum, count) => sum + count, 0),
    [inventory.cardCollection]
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
      const [nextGold, inventoryResult] = await Promise.all([
        getCurrentUserGold(),
        loadInventoryForCurrentUser(nextCustomization.skinId)
      ]);

      if (cancelled) {
        return;
      }

      storeAvatarCustomization(nextCustomization);
      setAvatarCustomization(nextCustomization);
      setGold(nextGold);
      setInventory(inventoryResult.inventory);
      setInventoryReady(true);
      setStatus(
        inventoryResult.persistedToDatabase
          ? "Inventory synced."
          : inventoryResult.errorMessage
            ? `Inventory is using local fallback: ${inventoryResult.errorMessage}`
            : "Inventory is using local fallback."
      );
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
          this.cameras.main.setBackgroundColor("#1d1408");
          this.add.rectangle(width / 2, height / 2, width, height, 0x1d1408);
          this.add.rectangle(width / 2, 100, width - 70, 160, 0x5a3412).setStrokeStyle(3, 0xfbbf24, 0.7);
          this.add.rectangle(216, 238, 210, 98, 0x14532d, 0.3).setStrokeStyle(2, 0x86efac, 0.9);
          this.add.rectangle(564, 238, 210, 98, 0x7c2d12, 0.3).setStrokeStyle(2, 0xfdba74, 0.9);
          this.add.rectangle(width / 2, height - 88, width - 120, 122, 0x38210f);
          this.add.text(width / 2, 34, "Focusland Grand Bazaar", {
            color: "#fde68a",
            fontSize: "28px",
            fontStyle: "bold"
          }).setOrigin(0.5);
          this.add.text(width / 2, 112, "Skins on the left. Packs on the right. The vault opens below.", {
            color: "#fff7ed",
            fontSize: "16px"
          }).setOrigin(0.5);
          this.add.text(216, 214, "Skin Counter", {
            color: "#ecfeff",
            fontSize: "24px",
            fontStyle: "bold"
          }).setOrigin(0.5);
          this.add.text(564, 214, "Pack Vault", {
            color: "#fff7ed",
            fontSize: "24px",
            fontStyle: "bold"
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

  useEffect(() => {
    if (!openingPack || !openingCards.length) {
      return;
    }

    if (openingStage === "charging") {
      playPackChargeSound();
      const timerId = window.setTimeout(() => {
        setOpeningStage("burst");
      }, 950);
      return () => window.clearTimeout(timerId);
    }

    if (openingStage === "burst") {
      playPackBurstSound();
      const timerId = window.setTimeout(() => {
        setOpeningStage("reveal");
      }, 620);
      return () => window.clearTimeout(timerId);
    }
  }, [openingPack, openingCards.length, openingStage]);

  useEffect(() => {
    if (openingStage === "reveal" && revealedCount === openingCards.length && openingCards.length > 0) {
      setOpeningStage("complete");
      setStatus(`Opened ${openingPack?.name}. ${openingCards.filter((card) => card.rarity === "epic" || card.rarity === "legendary").length > 0 ? "A high-rarity hit dropped." : "Pack added to collection."}`);
    }
  }, [openingCards, openingPack?.name, openingStage, revealedCount]);

  const persistInventory = async (nextInventory: ShopInventory, successText: string) => {
    setInventory(nextInventory);
    const result = await saveInventoryForCurrentUser(nextInventory);
    setInventory(result.inventory);
    setStatus(
      result.persistedToDatabase
        ? successText
        : result.errorMessage
          ? `${successText} Inventory saved locally because the profile inventory columns are not available yet. ${result.errorMessage}`
          : `${successText} Inventory saved locally.`
    );
    return result.inventory;
  };

  const handleSkinPurchase = async (product: ShopSkinProduct) => {
    if (ownsSkin(inventory, product.skinId)) {
      setStatus(`${product.name} is already unlocked.`);
      return;
    }

    if (gold < product.price) {
      setStatus(`Not enough gold for ${product.name}.`);
      return;
    }

    setBusyItemId(product.id);
    try {
      const nextGold = await applyGoldDelta(-product.price);
      const nextInventory: ShopInventory = {
        ...inventory,
        ownedSkinIds: normalizeOwnedSkinIds([...inventory.ownedSkinIds, product.skinId])
      };
      await persistInventory(nextInventory, `${product.name} unlocked.`);
      setGold(nextGold);
    } catch {
      setStatus(`Could not buy ${product.name}.`);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleEquipSkin = async (product: ShopSkinProduct) => {
    if (!ownsSkin(inventory, product.skinId)) {
      setStatus(`Buy ${product.name} before equipping it.`);
      return;
    }

    setBusyItemId(product.id);
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
    try {
      const nextGold = await applyGoldDelta(-product.price);
      const nextInventory: ShopInventory = {
        ...inventory,
        unopenedPacks: {
          ...inventory.unopenedPacks,
          [product.id]: (inventory.unopenedPacks[product.id] ?? 0) + 1
        }
      };
      await persistInventory(nextInventory, `${product.name} added to your vault.`);
      setGold(nextGold);
    } catch {
      setStatus(`Could not buy ${product.name}.`);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleStartOpening = async (pack: ShopPackProduct) => {
    if ((inventory.unopenedPacks[pack.id] ?? 0) <= 0) {
      setStatus(`No ${pack.name} left to open.`);
      return;
    }

    setBusyItemId(pack.id);
    try {
      const reveal = openPack(pack.id);
      const nextInventory: ShopInventory = {
        ...inventory,
        unopenedPacks: {
          ...inventory.unopenedPacks,
          [pack.id]: Math.max(0, (inventory.unopenedPacks[pack.id] ?? 0) - 1)
        },
        cardCollection: normalizeCollection(
          reveal.reduce<Record<string, number>>(
            (collection, card) => {
              collection[card.cardId] = (collection[card.cardId] ?? 0) + 1;
              return collection;
            },
            { ...inventory.cardCollection }
          )
        )
      };

      const savedInventory = await persistInventory(nextInventory, `${pack.name} cracked.`);
      setInventory(savedInventory);
      setOpeningPackId(pack.id);
      setOpeningCards(reveal);
      setOpeningStage("charging");
      setRevealedCount(0);
    } catch {
      setStatus(`Could not open ${pack.name}.`);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRevealNext = () => {
    if (openingStage !== "reveal") {
      return;
    }

    const nextCard = openingCards[revealedCount];
    if (!nextCard) {
      return;
    }

    playRevealSound(nextCard.rarity);
    setRevealedCount((current) => current + 1);
  };

  const handleCloseOpening = () => {
    setOpeningPackId(null);
    setOpeningCards([]);
    setOpeningStage("charging");
    setRevealedCount(0);
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 1180 }}>
        <h2>Shop</h2>
        <p>Buy skins, build a real pack vault, and crack packs one reveal at a time.</p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: 780, margin: "1rem auto" }} />
        <div className="shop-room-grid">
          <section style={panelStyle} className="shop-room-panel">
            <div className="shop-room-panel__top">
              <div>
                <strong>Wallet</strong>
                <p>Gold: {gold}</p>
              </div>
              <div>
                <strong>Collection</strong>
                <p>{collectionSize} total cards</p>
              </div>
              <div>
                <strong>Pack vault</strong>
                <p>{ownedPackSummary || "Empty"}</p>
              </div>
            </div>
            <div className="shop-room-status">{inventoryReady ? status ?? "The shop is open." : "Loading shop inventory..."}</div>
          </section>
          <section style={panelStyle} className="shop-room-panel">
            <div className="shop-room-avatar-row">
              <AvatarSprite customization={avatarCustomization} size={80} className="profile-avatar-preview" />
              <div>
                <strong>Equipped skin</strong>
                <p>{SHOP_SKIN_PRODUCTS.find((product) => product.skinId === avatarCustomization.skinId)?.name ?? "Abigail"}</p>
              </div>
            </div>
          </section>
        </div>

        <div className="shop-room-grid">
          <section style={panelStyle} className="shop-room-panel">
            <h3>Skins</h3>
            <div className="shop-skin-grid">
              {SHOP_SKIN_PRODUCTS.map((product) => {
                const unlocked = ownsSkin(inventory, product.skinId);
                const equipped = avatarCustomization.skinId === product.skinId;
                return (
                  <article key={product.id} className="shop-skin-card">
                    <AvatarSprite customization={{ skinId: product.skinId }} size={72} />
                    <div>
                      <strong>{product.name}</strong>
                      <p>{product.description}</p>
                      <span>{product.price} gold</span>
                    </div>
                    <div className="shop-skin-card__actions">
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
                  </article>
                );
              })}
            </div>
          </section>

          <section style={panelStyle} className="shop-room-panel">
            <div className="shop-pack-head">
              <h3>Pack Vault</h3>
              <label className="field">
                <span>Sort</span>
                <select value={packSort} onChange={(event) => setPackSort(event.target.value as PackSort)}>
                  <option value="qty">Most owned</option>
                  <option value="name">Name</option>
                  <option value="price">Price</option>
                </select>
              </label>
            </div>
            <div className="shop-pack-grid">
              {sortedPacks.map((product) => {
                const count = inventory.unopenedPacks[product.id] ?? 0;
                return (
                  <article
                    key={product.id}
                    className="shop-pack-card"
                    style={{ ["--pack-accent" as string]: product.accent, ["--pack-soft" as string]: product.accentSoft, ["--pack-glow" as string]: product.glow }}
                  >
                    <div className="shop-pack-card__shine" />
                    <div className="shop-pack-card__visual">
                      <strong>{product.name}</strong>
                      <span>{count} unopened</span>
                    </div>
                    <p>{product.description}</p>
                    <div className="shop-pack-card__actions">
                      <span>{product.price} gold</span>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busyItemId === product.id}
                        onClick={() => {
                          void handlePackPurchase(product);
                        }}
                      >
                        {busyItemId === product.id ? "Working..." : "Buy pack"}
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={count <= 0 || busyItemId === product.id}
                        onClick={() => {
                          void handleStartOpening(product);
                        }}
                      >
                        Open now
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <PackOpeningOverlay
        open={Boolean(openingPack)}
        pack={openingPack}
        stage={openingStage}
        revealCards={openingCards}
        revealedCount={revealedCount}
        onRevealNext={handleRevealNext}
        onClose={handleCloseOpening}
      />
    </div>
  );
};

export default ShopRoom;
