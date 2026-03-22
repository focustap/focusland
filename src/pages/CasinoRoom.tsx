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
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { createRoomPresenceController, ROOM_NAMES, type RoomPresenceController } from "../lib/roomPresenceController";
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
      let avatarCustomization = getStoredAvatarCustomization();
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
        roomPresence?: RoomPresenceController;

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
          color: number,
          markerX: number,
          markerY: number
        ) => {
          const glow = this.add.circle(markerX, markerY, 22, color, 0.28).setDepth(13);
          const marker = this.add.circle(markerX, markerY - 2, 11, color, 0.92)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setDepth(14);
          const tagWidth = Math.max(90, label.length * 8 + 20);
          const tag = this.add.rectangle(markerX, markerY + 24, tagWidth, 22, 0x0f172a, 0.88)
            .setStrokeStyle(1, color, 0.95)
            .setDepth(14);
          this.add.text(markerX, markerY + 24, label, {
            color: "#f8fafc",
            fontSize: "12px",
            fontStyle: "bold"
          }).setOrigin(0.5).setDepth(15);
          this.tweens.add({
            targets: [glow, marker],
            alpha: { from: glow.alpha, to: 0.52 },
            scale: { from: 0.96, to: 1.08 },
            duration: 1100,
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

        addTable(112, 92, 180, 90, "21 Table", "/casino/21", 0x0f766e, 102, 92);
        addTable(412, 230, 216, 96, "Ride the Bus", "/casino/bus", 0x0ea5e9, 410, 232);
        addTable(646, 296, 148, 188, "Slots", "/casino/slots", 0x7c3aed, 650, 292);

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
          if (userId) {
            this.roomPresence = createRoomPresenceController({
              scene: this,
              roomName: ROOM_NAMES.casino,
              userId,
              username,
              profileColor,
              getLocalPosition: () => ({ x: this.player.container.x, y: this.player.container.y })
            });
          }

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
          this.roomPresence?.animate();

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
