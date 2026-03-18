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
            const goldEarned = Math.max(1, Math.min(10, Math.floor(finalScore / 10)));
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
      let letterKeys: { a: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key } | undefined;
      let playerRect: Phaser.GameObjects.Rectangle | undefined;
      let playerBody: Phaser.Physics.Arcade.Body | undefined;
      let fallingBlocks: Phaser.GameObjects.Rectangle[] = [];
      let score = 0;
      let gameOver = false;
      let scoreText: Phaser.GameObjects.Text | undefined;
      let timerText: Phaser.GameObjects.Text | undefined;
      let timeLeft = 20;

      function create(this: Phaser.Scene) {
        this.cameras.main.setBackgroundColor("#082f49");

        score = 0;
        gameOver = false;
        timeLeft = 20;
        fallingBlocks = [];

        playerRect = this.add.rectangle(width / 2, height - 48, 88, 18, playerColor);
        this.physics.add.existing(playerRect);
        playerBody = playerRect.body as Phaser.Physics.Arcade.Body;
        playerBody.setAllowGravity(false);
        playerBody.setCollideWorldBounds(true);
        playerBody.setImmovable(true);

        cursors = this.input.keyboard?.createCursorKeys();
        if (this.input.keyboard) {
          letterKeys = this.input.keyboard.addKeys("A,D") as {
            a: Phaser.Input.Keyboard.Key;
            d: Phaser.Input.Keyboard.Key;
          };
        }

        scoreText = this.add.text(16, 16, "Score: 0", {
          fontSize: "18px",
          color: "#e0f2fe"
        });

        timerText = this.add.text(width - 120, 16, "Time: 20", {
          fontSize: "18px",
          color: "#e0f2fe"
        });

        this.time.addEvent({
          delay: 550,
          loop: true,
          callback: () => {
            if (gameOver) return;

            const isHazard = Math.random() < 0.3;
            const x = Phaser.Math.Between(30, width - 30);
            const block = this.add.rectangle(
              x,
              -20,
              24,
              24,
              isHazard ? 0xef4444 : 0x22c55e
            );

            this.physics.add.existing(block);
            const blockBody = block.body as Phaser.Physics.Arcade.Body;
            blockBody.setAllowGravity(false);
            blockBody.setVelocityY(Phaser.Math.Between(170, 250));
            (block as Phaser.GameObjects.Rectangle & { isHazard?: boolean }).isHazard = isHazard;
            fallingBlocks.push(block);

            if (playerRect) {
              this.physics.add.overlap(
                playerRect,
                block,
                () => {
                  if (gameOver) return;

                  const hitHazard = Boolean(
                    (block as Phaser.GameObjects.Rectangle & { isHazard?: boolean }).isHazard
                  );

                  block.destroy();
                  fallingBlocks = fallingBlocks.filter((item) => item !== block);

                  if (hitHazard) {
                    gameOver = true;
                    if (playerRect) {
                      playerRect.fillColor = 0xef4444;
                    }
                    this.physics.pause();
                    this.add
                      .text(width / 2, height / 2, "You got hit!", {
                        fontSize: "30px",
                        color: "#f8fafc"
                      })
                      .setOrigin(0.5);
                    handleGameOver(score);
                    return;
                  }

                  score += 5;
                  scoreText?.setText(`Score: ${score}`);
                },
                undefined,
                this
              );
            }
          }
        });

        this.time.addEvent({
          delay: 1000,
          loop: true,
          callback: () => {
            if (gameOver) return;

            timeLeft -= 1;
            timerText?.setText(`Time: ${timeLeft}`);

            if (timeLeft <= 0) {
              gameOver = true;
              this.physics.pause();
              this.add
                .text(width / 2, height / 2, "Time!", {
                  fontSize: "30px",
                  color: "#f8fafc"
                })
                .setOrigin(0.5);
              handleGameOver(score);
            }
          }
        });
      }

      function update(this: Phaser.Scene) {
        if (gameOver || !playerBody || !cursors) {
          return;
        }

        const speed = 320;
        playerBody.setVelocityX(0);

        if (cursors.left?.isDown || letterKeys?.a.isDown) {
          playerBody.setVelocityX(-speed);
        } else if (cursors.right?.isDown || letterKeys?.d.isDown) {
          playerBody.setVelocityX(speed);
        }

        fallingBlocks = fallingBlocks.filter((block) => {
          if (!block.active) {
            return false;
          }

          if (block.y > height + 30) {
            const wasHazard = Boolean(
              (block as Phaser.GameObjects.Rectangle & { isHazard?: boolean }).isHazard
            );

            block.destroy();

            if (!wasHazard) {
              score = Math.max(0, score - 2);
              scoreText?.setText(`Score: ${score}`);
            }

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
        <h2>Catch Game</h2>
        <p>Move with arrow keys or A/D. Catch green blocks and avoid red ones.</p>
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
              setStatus("Catch the green blocks and dodge the red ones with arrow keys or A/D.");
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
