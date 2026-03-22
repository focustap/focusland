import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Phaser from "phaser";
import {
  createAvatarRender,
  getStoredAvatarCustomization,
  loadAvatarSpriteSheet,
  normalizeAvatarCustomization,
  TOWN_AVATAR_SCALE,
  updateAvatarRender,
  type AvatarCustomization,
  type AvatarRender
} from "../lib/avatarSprites";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor, profileColorToNumber } from "../lib/profileColor";
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

const CardRoom: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    let isUnmounted = false;
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const width = 780;
      const height = 500;
      let playerColor = profileColorToNumber(DEFAULT_PROFILE_COLOR);
      let avatarCustomization = getStoredAvatarCustomization();

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        playerColor = profileColorToNumber(
          normalizeProfileColor((profile?.color as string | null) ?? DEFAULT_PROFILE_COLOR)
        );
        avatarCustomization = normalizeAvatarCustomization(
          (profile as { avatar_customization?: Partial<AvatarCustomization> | null } | null)?.avatar_customization
          ?? avatarCustomization
        );
      }

      if (isUnmounted || !containerRef.current) {
        return;
      }

      class CardHallScene extends Phaser.Scene {
        player!: AvatarRender;
        targetX: number | null = null;
        targetY: number | null = null;
        pendingRoute: string | null = null;
        hotspots: Hotspot[] = [];

        preload() {
          loadAvatarSpriteSheet(this, assetBase);
        }

        create() {
          this.cameras.main.setBackgroundColor("#120b22");
          this.add.rectangle(width / 2, height / 2, width, height, 0x140b1f);
          this.add.rectangle(width / 2, height / 2, width - 28, height - 28, 0x25133d)
            .setStrokeStyle(3, 0xf59e0b, 0.24);
          this.add.text(width / 2, 34, "TapDeck Hall", {
            color: "#fde68a",
            fontSize: "30px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.add.rectangle(width / 2, 160, 300, 96, 0x5b21b6, 0.32).setStrokeStyle(3, 0xc084fc, 0.9);
          this.add.text(width / 2, 146, "TapDeck Play", {
            color: "#faf5ff",
            fontSize: "26px",
            fontStyle: "bold"
          }).setOrigin(0.5);
          this.add.text(width / 2, 178, "Online duels", {
            color: "#ddd6fe",
            fontSize: "16px"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/cards/play",
            x: width / 2,
            y: 160,
            width: 320,
            height: 120,
            entranceX: width / 2,
            entranceY: 230
          });

          this.add.rectangle(width / 2, 318, 300, 96, 0x0f766e, 0.3).setStrokeStyle(3, 0x5eead4, 0.88);
          this.add.text(width / 2, 304, "TapDeck Decks", {
            color: "#ecfeff",
            fontSize: "26px",
            fontStyle: "bold"
          }).setOrigin(0.5);
          this.add.text(width / 2, 336, "Build and save deck drafts", {
            color: "#ccfbf1",
            fontSize: "16px"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/cards/decks",
            x: width / 2,
            y: 318,
            width: 320,
            height: 120,
            entranceX: width / 2,
            entranceY: 388
          });

          this.add.rectangle(84, height - 76, 88, 112, 0x1f4d3c, 0.32).setStrokeStyle(2, 0x86efac, 0.72);
          this.add.text(84, height - 18, "Arcade", {
            color: "#dcfce7",
            fontSize: "15px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/arcade",
            x: 84,
            y: height - 76,
            width: 92,
            height: 116,
            entranceX: 84,
            entranceY: height - 118
          });

          this.player = createAvatarRender(this, width / 2, height - 82, avatarCustomization, 12, TOWN_AVATAR_SCALE);

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
          if (this.targetX == null || this.targetY == null) {
            return;
          }

          const dx = this.targetX - this.player.container.x;
          const dy = this.targetY - this.player.container.y;
          const distance = Math.hypot(dx, dy);
          const step = (230 * delta) / 1000;

          if (distance <= step) {
            this.player.container.setPosition(this.targetX, this.targetY - 18);
            updateAvatarRender(this.player, avatarCustomization, "front", false);
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
            avatarCustomization,
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
        scene: CardHallScene
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
  }, [navigate]);

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 840 }}>
        <h2>TapDeck Hall</h2>
        <p>Walk into the TapDeck play room for live matches or head into the deck room to work on a build.</p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: 780, margin: "1rem auto" }} />
      </div>
    </div>
  );
};

export default CardRoom;
