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
  route: string;
  x: number;
  y: number;
  width: number;
  height: number;
  entranceX: number;
  entranceY: number;
};

const InvadersRoom: React.FC = () => {
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

      class HangarScene extends Phaser.Scene {
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
          this.cameras.main.setBackgroundColor("#04111f");
          this.add.rectangle(width / 2, height / 2, width, height, 0x081829);
          this.add.rectangle(width / 2, height / 2, width - 36, height - 36, 0x10253e);
          this.add.rectangle(width / 2, height / 2, width - 160, height - 150, 0x0f172a);
          this.add.text(width / 2, 34, "Defender Hangar", {
            color: "#7dd3fc",
            fontSize: "28px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          for (let i = 0; i < 8; i += 1) {
            this.add.circle(120 + i * 78, 110 + (i % 2) * 18, 2, 0xe2e8f0);
          }

          this.add.rectangle(width / 2, 248, 240, 120, 0x1d4ed8);
          this.add.rectangle(width / 2, 248, 180, 84, 0x020617);
          this.add.text(width / 2, 248, "INVADERS", {
            color: "#e0f2fe",
            fontSize: "26px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/invaders",
            x: width / 2,
            y: 248,
            width: 240,
            height: 120,
            entranceX: width / 2,
            entranceY: 330
          });

          this.add.rectangle(width - 110, height - 78, 86, 116, 0x31211a);
          this.add.rectangle(width - 110, height - 90, 58, 78, 0x9a3412);
          this.add.text(width - 110, height - 14, "Hub Door", {
            color: "#ffedd5",
            fontSize: "15px",
            fontStyle: "bold"
          }).setOrigin(0.5);

          this.hotspots.push({
            route: "/lobby",
            x: width - 110,
            y: height - 78,
            width: 86,
            height: 116,
            entranceX: width - 110,
            entranceY: height - 118
          });

          this.player = createAvatarRender(this, 140, height - 84, avatarCustomization, 12, TOWN_AVATAR_SCALE);
          if (userId) {
            this.roomPresence = createRoomPresenceController({
              scene: this,
              roomName: ROOM_NAMES.invaders,
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
        scene: HangarScene
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
        <h2>Hangar</h2>
        <p>Walk up to the console wall to launch Space Invaders, or use the hangar door to head back to town.</p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: 780, margin: "1rem auto" }} />
      </div>
    </div>
  );
};

export default InvadersRoom;
