// Game page.
// Simple Phaser minigame where the player dodges falling rectangles.
// Arrow keys move the player; score increases over time.
// When the player is hit, the game ends and we try to save the score.
import React, { useEffect, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import Phaser from "phaser";
import { saveScoreToSupabase } from "../lib/scores";

const Game: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("Use arrow keys to dodge!");
  const [canRestart, setCanRestart] = useState(false);
  const [restartCount, setRestartCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const width = 480;
    const height = 640;

    // This callback will be called by the Phaser game when the player is hit.
    const handleGameOver = (finalScore: number) => {
      setLastScore(finalScore);
      setStatus("Game over! Saving score...");
      setCanRestart(true);

      // Try to save the score directly to Supabase, but fail gracefully
      // during local development or if something goes wrong.
      void (async () => {
        try {
          await saveScoreToSupabase("dodge", finalScore);
          setStatus("Game over! Score saved.");
        } catch {
          setStatus("Game over! Score could not be saved locally.");
        }
      })();
    };

    // Variables shared with the scene functions.
    let cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    let playerRect: Phaser.GameObjects.Rectangle | undefined;
    let playerBody: Phaser.Physics.Arcade.Body | undefined;
    // We keep enemies in a simple array to make the logic easy to follow.
    let enemies: Phaser.GameObjects.Rectangle[] = [];
    let gameOver = false;
    let score = 0;
    let scoreText: Phaser.GameObjects.Text | undefined;

    function create(this: Phaser.Scene) {
      this.cameras.main.setBackgroundColor("#0f172a");

      // Reset game state when (re)creating the scene.
      enemies = [];
      gameOver = false;
      score = 0;
      if (scoreText) {
        scoreText.setText("Score: 0");
      }

      // Create a simple rectangle for the player and enable physics on it.
      playerRect = this.add.rectangle(width / 2, height - 60, 40, 20, 0x38bdf8);
      this.physics.add.existing(playerRect);
      playerBody = playerRect.body as Phaser.Physics.Arcade.Body;
      playerBody.setCollideWorldBounds(true);
      playerBody.setAllowGravity(false);

      cursors = this.input.keyboard.createCursorKeys();

      scoreText = this.add.text(16, 16, "Score: 0", {
        fontSize: "18px",
        color: "#e5e7eb"
      });

      // Spawn a new falling enemy (red rectangle) regularly.
      this.time.addEvent({
        delay: 800,
        loop: true,
        callback: () => {
          if (gameOver) return;
          const x = Phaser.Math.Between(30, width - 30);
          const rect = this.add.rectangle(x, -20, 30, 30, 0xf97373);
          this.physics.add.existing(rect);
          const body = rect.body as Phaser.Physics.Arcade.Body;
          body.setVelocityY(Phaser.Math.Between(150, 250));
          body.setAllowGravity(false);
          enemies.push(rect);

          // Set up overlap detection for this enemy.
          if (playerRect) {
            this.physics.add.overlap(
              playerRect,
              rect,
              () => {
                if (gameOver) return;
                gameOver = true;
                this.physics.pause();
                if (playerRect) {
                  playerRect.fillColor = 0xf97373;
                }
                this.add
                  .text(width / 2, height / 2, "Game Over", {
                    fontSize: "32px",
                    color: "#f9fafb"
                  })
                  .setOrigin(0.5);
                handleGameOver(score);
              },
              undefined,
              this
            );
          }
        }
      });

      // Increase score over time.
      this.time.addEvent({
        delay: 250,
        loop: true,
        callback: () => {
          if (gameOver || !scoreText) return;
          score += 1;
          scoreText.setText(`Score: ${score}`);
        }
      });
    }

    function update(this: Phaser.Scene) {
      // Guard against undefined objects to avoid runtime errors.
      if (gameOver || !cursors || !playerBody) return;

      const speed = 250;
      playerBody.setVelocityX(0);

      if (cursors.left?.isDown) {
        playerBody.setVelocityX(-speed);
      } else if (cursors.right?.isDown) {
        playerBody.setVelocityX(speed);
      }

      // Clean up enemies that have fallen off screen.
      enemies = enemies.filter((enemy) => {
        const body = enemy.body as Phaser.Physics.Arcade.Body | undefined;
        if (body && enemy.y > height + 50) {
          enemy.destroy();
          return false;
        }
        return true;
      });
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: containerRef.current,
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 0 },
          debug: false
        }
      },
      scene: { create, update }
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [restartCount]);

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Dodge Game</h2>
        <p>Move with the left and right arrow keys. Dodge the falling blocks.</p>
        <div
          ref={containerRef}
          style={{ width: "100%", maxWidth: 480, margin: "1rem auto" }}
        />
        <p className="score-display">
          {lastScore !== null
            ? `Last score: ${lastScore}`
            : "Survive as long as you can!"}
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
              setStatus("Use arrow keys to dodge!");
            }}
          >
            Restart game
          </button>
        )}
      </div>
    </div>
  );
};

export default Game;

