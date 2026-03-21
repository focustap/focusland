import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import { profileColorToNumber } from "../lib/profileColor";
import { recordArcadeResult } from "../lib/progression";
import { supabase } from "../lib/supabase";

const CatchGame: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [status, setStatus] = useState("Catch the green blocks and dodge the red ones.");
  const [canRestart, setCanRestart] = useState(false);
  const [restartCount, setRestartCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let isUnmounted = false;
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const width = 480;
      const height = 640;
      let playerColor = profileColorToNumber(null);

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("color")
          .eq("id", session.user.id)
          .maybeSingle();

        playerColor = profileColorToNumber((profile?.color as string | null) ?? null);
      }

      if (isUnmounted || !containerRef.current) {
        return;
      }

      const handleGameOver = (finalScore: number) => {
        setLastScore(finalScore);
        setStatus("Round over. Saving score...");
        setCanRestart(true);

        void (async () => {
          try {
            const goldEarned = Math.max(2, Math.min(16, Math.floor(finalScore / 16)));
            await recordArcadeResult({
              scoreGameName: "catch",
              score: finalScore,
              goldEarned,
              stats: {
                catch_best_score: finalScore
              }
            });
            setStatus(`Round over. Score saved. +${goldEarned} gold.`);
          } catch {
            setStatus("Round over. Score could not be saved locally.");
          }
        })();
      };

      let cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
      let leftLetterKey: Phaser.Input.Keyboard.Key | undefined;
      let rightLetterKey: Phaser.Input.Keyboard.Key | undefined;
      let playerRect: Phaser.GameObjects.Rectangle | undefined;
      let playerBody: Phaser.Physics.Arcade.Body | undefined;
      let fallingBlocks: Array<
        Phaser.GameObjects.Rectangle & {
          kind?: "good" | "hazard" | "time";
          driftX?: number;
        }
      > = [];
      let movingDots: Array<
        Phaser.GameObjects.Arc & {
          driftX?: number;
          driftY?: number;
        }
      > = [];
      let strikeWarnings: Phaser.GameObjects.Rectangle[] = [];
      let strikeBeams: Phaser.GameObjects.Rectangle[] = [];
      let crushWarnings: Phaser.GameObjects.Rectangle[] = [];
      let crushWalls: Phaser.GameObjects.Rectangle[] = [];
      let score = 0;
      let combo = 0;
      let comboTimeoutAt = 0;
      let gameOver = false;
      let scoreText: Phaser.GameObjects.Text | undefined;
      let timerText: Phaser.GameObjects.Text | undefined;
      let comboText: Phaser.GameObjects.Text | undefined;
      let phaseText: Phaser.GameObjects.Text | undefined;
      let timeLeft = 28;
      let elapsedSeconds = 0;

      const playTone = (
        scene: Phaser.Scene,
        frequency: number,
        durationMs: number,
        type: OscillatorType,
        volume: number,
        sweepTo?: number
      ) => {
        const audioContext = scene.sound.context as AudioContext | undefined;
        if (!audioContext) return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        if (typeof sweepTo === "number") {
          oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(20, sweepTo),
            audioContext.currentTime + durationMs / 1000
          );
        }

        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          audioContext.currentTime + durationMs / 1000
        );

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + durationMs / 1000);
      };

      const endRound = (scene: Phaser.Scene, message: string) => {
        if (gameOver) return;
        gameOver = true;
        scene.physics.pause();
        playTone(scene, 220, 320, "sawtooth", 0.07, 90);
        playerRect?.setFillStyle(0xf87171);
        scene.cameras.main.shake(180, 0.008);
        scene.add
          .text(width / 2, height / 2, message, {
            fontSize: "30px",
            color: "#f8fafc",
            fontStyle: "bold"
          })
          .setOrigin(0.5);
        handleGameOver(score);
      };

      const updateComboText = () => {
        comboText?.setText(combo > 1 ? `Combo x${combo}` : "Combo x1");
      };

      const phaseLabel = () => {
        if (elapsedSeconds >= 20) return "Phase: Collapse";
        if (elapsedSeconds >= 14) return "Phase: Storm";
        if (elapsedSeconds >= 7) return "Phase: Rush";
        return "Phase: Warmup";
      };

      const clearObject = (object: Phaser.GameObjects.GameObject) => {
        object.destroy();
      };

      function create(this: Phaser.Scene) {
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x020617, 0x082f49, 0x0f172a, 0x14532d, 1);
        bg.fillRect(0, 0, width, height);

        for (let i = 0; i < 36; i += 1) {
          this.add.circle(
            Phaser.Math.Between(0, width),
            Phaser.Math.Between(0, height),
            Phaser.Math.Between(1, 2),
            0xffffff,
            Phaser.Math.FloatBetween(0.15, 0.45)
          );
        }

        this.add.rectangle(width / 2, 28, width - 24, 44, 0x082f49, 0.82).setStrokeStyle(1, 0x7dd3fc, 0.25);
        this.add.text(width / 2, 28, "Catch Rush", {
          fontSize: "20px",
          color: "#e0f2fe",
          fontStyle: "bold"
        }).setOrigin(0.5);

        score = 0;
        combo = 0;
        comboTimeoutAt = 0;
        gameOver = false;
        timeLeft = 28;
        elapsedSeconds = 0;
        fallingBlocks = [];
        movingDots = [];
        strikeWarnings = [];
        strikeBeams = [];
        crushWarnings = [];
        crushWalls = [];

        playerRect = this.add.rectangle(width / 2, height - 48, 88, 18, playerColor);
        playerRect.setStrokeStyle(2, 0xe0f2fe, 0.55);
        this.physics.add.existing(playerRect);
        playerBody = playerRect.body as Phaser.Physics.Arcade.Body;
        playerBody.setAllowGravity(false);
        playerBody.setCollideWorldBounds(true);
        playerBody.setImmovable(true);

        cursors = this.input.keyboard?.createCursorKeys();
        if (this.input.keyboard) {
          leftLetterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
          rightLetterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        }

        scoreText = this.add.text(18, 54, "Score: 0", {
          fontSize: "18px",
          color: "#e0f2fe"
        });

        timerText = this.add.text(width - 118, 54, "Time: 28", {
          fontSize: "18px",
          color: "#e0f2fe"
        });

        comboText = this.add.text(18, 82, "Combo x1", {
          fontSize: "16px",
          color: "#bfdbfe"
        });

        phaseText = this.add.text(width - 144, 82, phaseLabel(), {
          fontSize: "16px",
          color: "#93c5fd"
        });

        this.time.addEvent({
          delay: 420,
          loop: true,
          callback: () => {
            if (gameOver) return;

            const hazardChance = elapsedSeconds >= 20 ? 0.3 : elapsedSeconds >= 14 ? 0.26 : elapsedSeconds >= 7 ? 0.2 : 0.12;
            const timeChance = elapsedSeconds >= 6 ? 0.08 : 0.04;
            const roll = Math.random();
            const kind: "good" | "hazard" | "time" =
              roll < timeChance ? "time" : roll < timeChance + hazardChance ? "hazard" : "good";
            const x = Phaser.Math.Between(34, width - 34);
            const size = kind === "time" ? 22 : 24;
            const block = this.add.rectangle(
              x,
              -20,
              size,
              size,
              kind === "hazard" ? 0xef4444 : kind === "time" ? 0x60a5fa : 0x22c55e
            ) as Phaser.GameObjects.Rectangle & {
              kind?: "good" | "hazard" | "time";
              driftX?: number;
            };
            block.kind = kind;
            block.driftX = Phaser.Math.Between(-36, 36);
            block.setStrokeStyle(2, kind === "time" ? 0xe0f2fe : 0xf8fafc, 0.55);

            this.physics.add.existing(block);
            const blockBody = block.body as Phaser.Physics.Arcade.Body;
            blockBody.setAllowGravity(false);
            blockBody.setVelocityY(Phaser.Math.Between(185 + elapsedSeconds * 4, 255 + elapsedSeconds * 7));
            blockBody.setVelocityX(block.driftX);
            fallingBlocks.push(block);

            if (playerRect) {
              this.physics.add.overlap(
                playerRect,
                block,
                () => {
                  if (gameOver) return;

                  const hitHazard = block.kind === "hazard";
                  const hitTime = block.kind === "time";
                  clearObject(block);
                  fallingBlocks = fallingBlocks.filter((item) => item !== block);

                  if (hitHazard) {
                    endRound(this, "You got hit!");
                    return;
                  }

                  if (hitTime) {
                    playTone(this, 660, 120, "triangle", 0.05, 920);
                    playTone(this, 920, 140, "triangle", 0.035, 1180);
                    timeLeft += 4;
                    score += 6;
                    timerText?.setText(`Time: ${timeLeft}`);
                    this.cameras.main.flash(120, 96, 165, 250, false);
                  } else {
                    playTone(this, 520 + combo * 24, 90, "square", 0.04, 700 + combo * 18);
                    combo = Math.min(combo + 1, 8);
                    comboTimeoutAt = this.time.now + 2200;
                    score += 8 + combo * 2;
                    updateComboText();
                  }

                  scoreText?.setText(`Score: ${score}`);
                },
                undefined,
                this
              );
            }
          }
        });

        this.time.addEvent({
          delay: 1700,
          loop: true,
          callback: () => {
            if (gameOver || elapsedSeconds < 7) return;

            const fromLeft = Math.random() < 0.5;
            const orb = this.add.circle(
              fromLeft ? -18 : width + 18,
              Phaser.Math.Between(120, height - 120),
              10,
              0xf87171
            ) as Phaser.GameObjects.Arc & { driftX?: number; driftY?: number };
            orb.setStrokeStyle(2, 0xfca5a5, 0.55);
            orb.driftX = fromLeft ? Phaser.Math.Between(140, 210) : -Phaser.Math.Between(140, 210);
            orb.driftY = Phaser.Math.Between(-60, 60);

            this.physics.add.existing(orb);
            const orbBody = orb.body as Phaser.Physics.Arcade.Body;
            orbBody.setAllowGravity(false);
            orbBody.setVelocity(orb.driftX, orb.driftY);
            orbBody.setBounce(1, 1);
            orbBody.setCollideWorldBounds(true);
            movingDots.push(orb);

            if (playerRect) {
              this.physics.add.overlap(playerRect, orb, () => endRound(this, "Orb clipped you!"), undefined, this);
            }
          }
        });

        this.time.addEvent({
          delay: 2600,
          loop: true,
          callback: () => {
            if (gameOver || elapsedSeconds < 14) return;

            const targetX = Phaser.Math.Between(48, width - 48);
            const warning = this.add.rectangle(targetX, height - 78, 54, 20, 0xf97316, 0.3);
            warning.setStrokeStyle(2, 0xfdba74, 0.65);
            strikeWarnings.push(warning);

            this.tweens.add({
              targets: warning,
              alpha: 0.85,
              yoyo: true,
              repeat: 2,
              duration: 110
            });

            this.time.delayedCall(650, () => {
              strikeWarnings = strikeWarnings.filter((item) => item !== warning);
              clearObject(warning);

              const beam = this.add.rectangle(targetX, height / 2, 42, height - 120, 0xf97316, 0.28);
              beam.setStrokeStyle(2, 0xfde68a, 0.65);
              strikeBeams.push(beam);
              playTone(this, 180, 180, "sawtooth", 0.045, 120);
              this.cameras.main.shake(80, 0.003);

              if (playerRect && Math.abs(playerRect.x - targetX) < 44) {
                endRound(this, "Strike hit!");
              }

              this.time.delayedCall(220, () => {
                strikeBeams = strikeBeams.filter((item) => item !== beam);
                clearObject(beam);
              });
            });
          }
        });

        this.time.addEvent({
          delay: 3400,
          loop: true,
          callback: () => {
            if (gameOver || elapsedSeconds < 20) return;

            const laneWidth = 86;
            const safeX = Phaser.Math.Between(76, width - 76);
            const leftWidth = Math.max(0, safeX - laneWidth / 2);
            const rightX = safeX + laneWidth / 2;
            const rightWidth = Math.max(0, width - rightX);
            const warningY = height - 82;

            if (leftWidth > 0) {
              const leftWarning = this.add.rectangle(leftWidth / 2, warningY, leftWidth, 26, 0xdc2626, 0.24);
              leftWarning.setStrokeStyle(2, 0xfca5a5, 0.7);
              crushWarnings.push(leftWarning);
              this.tweens.add({ targets: leftWarning, alpha: 0.72, yoyo: true, repeat: 3, duration: 110 });
            }

            if (rightWidth > 0) {
              const rightWarning = this.add.rectangle(rightX + rightWidth / 2, warningY, rightWidth, 26, 0xdc2626, 0.24);
              rightWarning.setStrokeStyle(2, 0xfca5a5, 0.7);
              crushWarnings.push(rightWarning);
              this.tweens.add({ targets: rightWarning, alpha: 0.72, yoyo: true, repeat: 3, duration: 110 });
            }

            const safeMarker = this.add.rectangle(safeX, warningY, laneWidth, 26, 0x38bdf8, 0.22);
            safeMarker.setStrokeStyle(2, 0xe0f2fe, 0.78);
            crushWarnings.push(safeMarker);
            this.tweens.add({ targets: safeMarker, alpha: 0.85, yoyo: true, repeat: 3, duration: 110 });
            playTone(this, 240, 150, "sawtooth", 0.04, 160);

            this.time.delayedCall(900, () => {
              crushWarnings.forEach((warning) => clearObject(warning));
              crushWarnings = [];

              if (leftWidth > 0) {
                const leftWall = this.add.rectangle(leftWidth / 2, height / 2, leftWidth, height - 120, 0xb91c1c, 0.34);
                leftWall.setStrokeStyle(2, 0xfca5a5, 0.65);
                crushWalls.push(leftWall);
              }

              if (rightWidth > 0) {
                const rightWall = this.add.rectangle(rightX + rightWidth / 2, height / 2, rightWidth, height - 120, 0xb91c1c, 0.34);
                rightWall.setStrokeStyle(2, 0xfca5a5, 0.65);
                crushWalls.push(rightWall);
              }

              playTone(this, 150, 220, "sawtooth", 0.05, 90);
              this.cameras.main.shake(120, 0.004);

              if (playerRect && Math.abs(playerRect.x - safeX) > laneWidth / 2 - 8) {
                endRound(this, "The walls closed in!");
              }

              this.time.delayedCall(260, () => {
                crushWalls.forEach((wall) => clearObject(wall));
                crushWalls = [];
              });
            });
          }
        });

        this.time.addEvent({
          delay: 1000,
          loop: true,
          callback: () => {
            if (gameOver) return;

            elapsedSeconds += 1;
            timeLeft -= 1;
            timerText?.setText(`Time: ${timeLeft}`);
            phaseText?.setText(phaseLabel());
            if (!gameOver && timeLeft <= 5) {
              playTone(this, 440, 70, "triangle", 0.028, 520);
            }

            if (timeLeft <= 0) {
              endRound(this, "Time!");
            }
          }
        });
      }

      function update(this: Phaser.Scene) {
        if (gameOver || !playerBody || !cursors) {
          return;
        }

        const speed = elapsedSeconds >= 14 ? 360 : 330;
        playerBody.setVelocityX(0);

        if (cursors.left?.isDown || leftLetterKey?.isDown) {
          playerBody.setVelocityX(-speed);
        } else if (cursors.right?.isDown || rightLetterKey?.isDown) {
          playerBody.setVelocityX(speed);
        }

        if (playerRect) {
          const velocityX = playerBody.velocity.x;
          playerRect.rotation = Phaser.Math.Linear(playerRect.rotation, velocityX / 1800, 0.2);
        }

        if (combo > 0 && this.time.now > comboTimeoutAt) {
          combo = 0;
          updateComboText();
        }

        fallingBlocks = fallingBlocks.filter((block) => {
          if (!block.active) {
            return false;
          }

          if (block.y > height + 30) {
            const wasHazard = block.kind === "hazard" || block.kind === "time";
            clearObject(block);

            if (!wasHazard && block.kind === "good") {
              score = Math.max(0, score - 3);
              combo = 0;
              updateComboText();
              scoreText?.setText(`Score: ${score}`);
            }

            return false;
          }

          if (block.x < 18 || block.x > width - 18) {
            block.driftX = -(block.driftX ?? 0);
            const blockBody = block.body as Phaser.Physics.Arcade.Body;
            blockBody.setVelocityX(block.driftX);
          }

          return true;
        });

        movingDots = movingDots.filter((orb) => {
          if (!orb.active) {
            return false;
          }

          if (orb.y < 90 || orb.y > height - 90) {
            const orbBody = orb.body as Phaser.Physics.Arcade.Body;
            orbBody.setVelocityY(-orbBody.velocity.y);
          }

          if (orb.x < -30 || orb.x > width + 30) {
            clearObject(orb);
            return false;
          }

          return true;
        });
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
        scene: { create, update }
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
  }, [restartCount]);

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Catch Rush</h2>
        <p>Move with arrow keys or A/D. Catch green drops, grab rare blue time cubes, dodge red hazards, then survive the late-round storm.</p>
        <div
          ref={containerRef}
          style={{ width: "100%", maxWidth: 480, margin: "1rem auto" }}
        />
        <p className="score-display">
          {lastScore !== null ? `Last score: ${lastScore}` : "Stack up points before time runs out."}
        </p>
        <p className="info">{status}</p>
        {canRestart && (
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setRestartCount((count) => count + 1);
              setCanRestart(false);
              setLastScore(null);
              setStatus("Catch green drops, cash in blue time cubes, and survive the rush, storm, and collapse.");
            }}
          >
            Restart game
          </button>
        )}
      </div>
    </div>
  );
};

export default CatchGame;
