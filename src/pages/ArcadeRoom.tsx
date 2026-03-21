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
  label: string;
  route: string;
  x: number;
  y: number;
  width: number;
  height: number;
  entranceX: number;
  entranceY: number;
};

const ArcadeRoom: React.FC = () => {
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
      const height = 520;
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

      class ArcadeScene extends Phaser.Scene {
        player!: AvatarRender;
        playerShadow!: Phaser.GameObjects.Ellipse;
        targetX: number | null = null;
        targetY: number | null = null;
        pendingRoute: string | null = null;
        hotspots: Hotspot[] = [];

        preload() {
          loadAvatarSpriteSheet(this, assetBase);
        }

        create() {
          this.cameras.main.setBackgroundColor("#020617");
          this.add.rectangle(width / 2, height / 2, width, height, 0x111827);
          this.add.rectangle(width / 2, height / 2, width - 30, height - 30, 0x1f2937);
          this.add.rectangle(width / 2, height / 2, width - 70, height - 92, 0x0b1220);
          this.add.rectangle(width / 2, height - 76, width - 120, 98, 0x111827);

        this.add.text(width / 2, 34, "Focusland Arcade", {
          color: "#7dd3fc",
          fontSize: "28px",
          fontStyle: "bold"
        }).setOrigin(0.5);

        const machines = [
          { label: "Dodge", route: "/game", x: 130, y: 168, color: 0x22c55e },
          { label: "Catch", route: "/catch", x: 315, y: 168, color: 0xf97316 },
          { label: "Pong", route: "/pong", x: 500, y: 168, color: 0x06b6d4 },
          { label: "8 Ball", route: "/pool", x: 650, y: 168, color: 0x0f766e }
        ];

        machines.forEach((machine) => {
          this.add.rectangle(machine.x, machine.y, 96, 128, machine.color);
          this.add.rectangle(machine.x, machine.y - 12, 68, 48, 0x020617, 0.9);
          this.add.circle(machine.x, machine.y + 30, 7, 0xf43f5e);
          this.add.circle(machine.x + 18, machine.y + 30, 7, 0xfacc15);
          this.add.rectangle(machine.x, machine.y + 58, 24, 8, 0xe5e7eb);
          this.add.text(machine.x, machine.y + 82, machine.label, {
            color: "#f8fafc",
            fontSize: "16px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.hotspots.push({
            label: machine.label,
            route: machine.route,
            x: machine.x,
            y: machine.y,
            width: 96,
            height: 128,
            entranceX: machine.x,
            entranceY: machine.y + 88
          });
        });

        const doorY = height - 70;
        this.add.rectangle(width - 96, doorY, 88, 120, 0x31211a);
        this.add.rectangle(width - 96, doorY - 12, 58, 78, 0x9a3412);
        this.add.text(width - 96, doorY + 58, "Hub Door", {
          color: "#ffedd5",
          fontSize: "15px",
          fontStyle: "bold"
        }).setOrigin(0.5);

        this.hotspots.push({
          label: "Hub Door",
          route: "/lobby",
          x: width - 96,
          y: doorY,
          width: 88,
          height: 120,
          entranceX: width - 96,
          entranceY: height - 100
        });

          this.playerShadow = this.add.ellipse(112, height - 84, 28, 12, 0x020617, 0.28);
          this.player = createAvatarRender(this, 112, height - 84, avatarCustomization, 12, 1.36);

          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            this.targetX = pointer.x;
            this.targetY = Phaser.Math.Clamp(pointer.y, 56, height - 24);
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
            this.playerShadow.setPosition(this.targetX, this.targetY + 18);
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
          this.playerShadow.setPosition(nextX, nextY + 18);
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
        scene: ArcadeScene
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
        <h2>Arcade Room</h2>
        <p>Click a machine to walk over and play. The main event games now have their own buildings in town.</p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: 780, margin: "1rem auto" }} />
      </div>
    </div>
  );
};

export default ArcadeRoom;
