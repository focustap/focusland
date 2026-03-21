import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Phaser from "phaser";
import {
  clampAvatarStyle,
  createAvatarImage,
  getStoredAvatarStyle,
  loadAvatarSpriteSheet,
  updateAvatarImage
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
      let avatarStyle = getStoredAvatarStyle();

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
        avatarStyle = clampAvatarStyle(Number((profile as { avatar_style?: number | null } | null)?.avatar_style ?? avatarStyle));
      }

      if (isUnmounted || !containerRef.current) {
        return;
      }

      class CasinoScene extends Phaser.Scene {
        player!: Phaser.GameObjects.Image;
        playerShadow!: Phaser.GameObjects.Ellipse;
        targetX: number | null = null;
        targetY: number | null = null;
        pendingRoute: string | null = null;
        hotspots: Hotspot[] = [];

        preload() {
          loadAvatarSpriteSheet(this, assetBase);
        }

        create() {
          this.cameras.main.setBackgroundColor("#14060a");
          this.add.rectangle(width / 2, height / 2, width, height, 0x2a0b14);
          this.add.rectangle(width / 2, height / 2, width - 36, height - 36, 0x4a1021);
          this.add.rectangle(width / 2, height / 2, width - 86, height - 86, 0x1f8a70, 0.85);
          this.add.rectangle(width / 2, height / 2, width - 140, height - 140, 0x0f6b58, 0.9);

          this.add.text(width / 2, 34, "Focusland Casino", {
            color: "#fde68a",
            fontSize: "28px",
            fontStyle: "bold"
          }).setOrigin(0.5);

        const addTable = (x: number, y: number, label: string, route: string, color: number) => {
          this.add.ellipse(x, y, 180, 88, color);
          this.add.ellipse(x, y - 6, 152, 58, 0x083344, 0.55);
          this.add.rectangle(x, y + 54, 18, 54, 0x4b2e19);
          this.add.text(x, y - 2, label, {
            color: "#f8fafc",
            fontSize: "18px",
            fontStyle: "bold"
          }).setOrigin(0.5);
          this.hotspots.push({
            label,
            route,
            x,
            y,
            width: 180,
            height: 88,
            entranceX: x,
            entranceY: y + 86,
            color
          });
        };

        addTable(width / 2, 166, "21 Table", "/casino/21", 0x0f766e);
        addTable(width / 2 - 210, 320, "Slots", "/casino/slots", 0x7c3aed);
        addTable(width / 2 + 210, 320, "Ride the Bus", "/casino/bus", 0x0ea5e9);

        const doorY = height - 72;
        this.add.rectangle(width / 2, doorY, 92, 120, 0x3f2a1d);
        this.add.rectangle(width / 2, doorY - 10, 64, 82, 0x8b5a2b);
        this.add.text(width / 2, doorY + 58, "Back to Hub", {
          color: "#fef3c7",
          fontSize: "16px",
          fontStyle: "bold"
        }).setOrigin(0.5);

        this.hotspots.push({
          label: "Back to Hub",
          route: "/lobby",
          x: width / 2,
          y: doorY,
          width: 92,
          height: 120,
          entranceX: width / 2,
          entranceY: height - 92,
          color: 0x8b5a2b
        });

          this.playerShadow = this.add.ellipse(width / 2, height - 102, 28, 12, 0x020617, 0.25);
          this.player = createAvatarImage(this, width / 2, height - 102, avatarStyle, "front", 12, 0.34);

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

          const dx = this.targetX - this.player.x;
          const dy = this.targetY - this.player.y;
          const distance = Math.hypot(dx, dy);
          const step = (220 * delta) / 1000;

          if (distance <= step) {
            this.player.setPosition(this.targetX, this.targetY - 18);
            this.playerShadow.setPosition(this.targetX, this.targetY + 18);
            updateAvatarImage(this.player, avatarStyle, "front");
            const route = this.pendingRoute;
            this.targetX = null;
            this.targetY = null;
            this.pendingRoute = null;
            if (route) {
              navigate(route);
            }
            return;
          }

          const nextX = Phaser.Math.Clamp(this.player.x + (dx / distance) * step, 20, width - 20);
          const nextY = Phaser.Math.Clamp(this.player.y + (dy / distance) * step, 36, height - 42);
          this.player.setPosition(nextX, nextY);
          this.playerShadow.setPosition(nextX, nextY + 36);
          updateAvatarImage(this.player, avatarStyle, dy < 0 ? "back" : "front");
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
