import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Phaser from "phaser";
import {
  createAvatarRender,
  getStoredAvatarCustomization,
  loadAvatarSpriteSheet,
  normalizeAvatarCustomization,
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

const BrawlRoom: React.FC = () => {
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

      class ArenaScene extends Phaser.Scene {
        player!: AvatarRender;
        targetX: number | null = null;
        targetY: number | null = null;
        pendingRoute: string | null = null;
        hotspots: Hotspot[] = [];

        preload() {
          loadAvatarSpriteSheet(this, assetBase);
        }

        create() {
          this.cameras.main.setBackgroundColor("#1f1304");
          this.add.rectangle(width / 2, height / 2, width, height, 0x2b1707);
          this.add.rectangle(width / 2, height / 2, width - 40, height - 40, 0x5b2a07);
          this.add.rectangle(width / 2, height - 68, width - 110, 116, 0x4a1d06);
          this.add.text(width / 2, 34, "Focus Arena", {
            color: "#fde68a",
            fontSize: "28px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.add.rectangle(width / 2, 250, 420, 18, 0x7c2d12);
          this.add.rectangle(width / 2, 242, 270, 14, 0xf59e0b);
          this.add.text(width / 2, 208, "Brawl Gate", {
            color: "#fff7ed",
            fontSize: "24px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/brawl",
            x: width / 2,
            y: 250,
            width: 420,
            height: 90,
            entranceX: width / 2,
            entranceY: 320
          });

          this.add.rectangle(width - 170, 252, 150, 18, 0x1d4ed8);
          this.add.rectangle(width - 170, 244, 104, 14, 0x93c5fd);
          this.add.text(width - 170, 208, "PvE Gate", {
            color: "#eff6ff",
            fontSize: "22px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/arena/pve",
            x: width - 170,
            y: 250,
            width: 170,
            height: 90,
            entranceX: width - 170,
            entranceY: 320
          });

          this.add.rectangle(110, height - 78, 86, 116, 0x31211a);
          this.add.rectangle(110, height - 90, 58, 78, 0x9a3412);
          this.add.text(110, height - 14, "Hub Door", {
            color: "#ffedd5",
            fontSize: "15px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/lobby",
            x: 110,
            y: height - 78,
            width: 86,
            height: 116,
            entranceX: 110,
            entranceY: height - 118
          });

          this.player = createAvatarRender(this, width / 2, height - 84, avatarCustomization, 12, 2.72);

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
        scene: ArenaScene
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
        <h2>Arena</h2>
        <p>Walk through the arena gate for PvP, take the new PvE gate into the boss world map, or head back to town through the side door.</p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: 780, margin: "1rem auto" }} />
      </div>
    </div>
  );
};

export default BrawlRoom;
