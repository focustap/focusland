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
  label: string;
  route: string;
  x: number;
  y: number;
  width: number;
  height: number;
  entranceX: number;
  entranceY: number;
  color: number;
};

const CasinoRoom: React.FC = () => {
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
      const width = 760;
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

      class CasinoScene extends Phaser.Scene {
        player!: AvatarRender;
        targetX: number | null = null;
        targetY: number | null = null;
        pendingRoute: string | null = null;
        hotspots: Hotspot[] = [];

        preload() {
          loadAvatarSpriteSheet(this, assetBase);
          this.load.image("casino-room", `${assetBase}assets/lobby/casino-room.png`);
        }

        create() {
          this.cameras.main.setBackgroundColor("#14060a");
          const bg = this.add.image(width / 2, height / 2, "casino-room");
          bg.setDisplaySize(width, height);
          this.add.rectangle(width / 2, 30, width, 68, 0x14060a, 0.34).setDepth(1);
          this.add.rectangle(width / 2, height - 18, width, 64, 0x14060a, 0.28).setDepth(1);
          this.add.rectangle(width / 2, height / 2, width - 12, height - 12, 0x000000, 0)
            .setStrokeStyle(2, 0xffffff, 0.08)
            .setDepth(12);

          this.add.text(width / 2, 34, "Focusland Casino", {
            color: "#fde68a",
            fontSize: "28px",
            fontStyle: "bold"
          }).setOrigin(0.5).setDepth(13);

        const addTable = (
          x: number,
          y: number,
          widthPx: number,
          heightPx: number,
          label: string,
          route: string,
          color: number
        ) => {
          const glow = this.add.ellipse(x, y, widthPx, heightPx, color, 0.18).setDepth(13);
          const ring = this.add.ellipse(x, y, widthPx - 8, heightPx - 8, 0x000000, 0)
            .setStrokeStyle(2, color, 0.9)
            .setDepth(14);
          this.add.text(x, y, label, {
            color: "#f8fafc",
            fontSize: "16px",
            fontStyle: "bold"
          }).setOrigin(0.5).setDepth(15);
          this.tweens.add({
            targets: [glow, ring],
            alpha: { from: 0.18, to: 0.34 },
            scale: { from: 0.98, to: 1.03 },
            duration: 950,
            yoyo: true,
            repeat: -1
          });
          this.hotspots.push({
            label,
            route,
            x,
            y,
            width: widthPx,
            height: heightPx,
            entranceX: x,
            entranceY: y + heightPx / 2 + 26,
            color
          });
        };

        addTable(112, 92, 180, 90, "21 Table", "/casino/21", 0x0f766e);
        addTable(412, 230, 216, 96, "Ride the Bus", "/casino/bus", 0x0ea5e9);
        addTable(646, 296, 148, 188, "Slots", "/casino/slots", 0x7c3aed);

        const doorY = height - 42;
        this.add.rectangle(width / 2, doorY, 176, 34, 0x14060a, 0.72)
          .setStrokeStyle(2, 0xf59e0b, 0.78)
          .setDepth(14);
        this.add.text(width / 2, doorY, "Back to Hub", {
          color: "#fef3c7",
          fontSize: "16px",
          fontStyle: "bold"
        }).setOrigin(0.5).setDepth(15);

        this.hotspots.push({
          label: "Back to Hub",
          route: "/lobby",
          x: width / 2,
          y: doorY,
          width: 176,
          height: 34,
          entranceX: width / 2,
          entranceY: height - 64,
          color: 0x8b5a2b
        });

          this.player = createAvatarRender(this, width / 2, height - 102, avatarCustomization, 12, TOWN_AVATAR_SCALE);

          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            this.targetX = pointer.x;
            this.targetY = Phaser.Math.Clamp(pointer.y, 54, height - 32);
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
          const step = (220 * delta) / 1000;

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

          const nextX = Phaser.Math.Clamp(this.player.container.x + (dx / distance) * step, 20, width - 20);
          const nextY = Phaser.Math.Clamp(this.player.container.y + (dy / distance) * step, 36, height - 42);
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
        scene: CasinoScene
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
      <div className="content card" style={{ maxWidth: 820 }}>
        <h2>Casino Room</h2>
        <p>Walk to a table to play, or use the door at the bottom to return to the main hub.</p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: 760, margin: "1rem auto" }} />
      </div>
    </div>
  );
};

export default CasinoRoom;
