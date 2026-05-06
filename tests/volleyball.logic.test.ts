import { describe, expect, it } from "vitest";
import {
  applyPoint,
  assignVolleyballTeams,
  calculateHitVelocity,
  configureVolleyballPlayers,
  createInitialVolleyballState,
  getMaxPlayers,
  resetForServe,
  startVolleyballMatch,
  stepVolleyballState,
  type VolleyballPresencePlayer
} from "../src/lib/volleyball/logic";
import {
  createVolleyballRoomSummary,
  isRoomJoinable,
  normalizeRoomCode,
  pruneStaleRooms
} from "../src/lib/volleyball/realtime";

const players: VolleyballPresencePlayer[] = [
  { userId: "a", username: "Ari", onlineAt: "1" },
  { userId: "b", username: "Bea", onlineAt: "2" },
  { userId: "c", username: "Cam", onlineAt: "3" },
  { userId: "d", username: "Dev", onlineAt: "4" }
];

describe("volleyball room helpers", () => {
  it("normalizes room codes and prunes stale room ads", () => {
    expect(normalizeRoomCode("ab-12-z")).toBe("AB12Z");
    const fresh = createVolleyballRoomSummary({
      code: "ABCDE",
      hostId: "a",
      hostName: "Ari",
      mode: "1v1",
      targetScore: 7
    });
    const stale = { ...fresh, code: "OLD12", updatedAt: 100 };
    expect(pruneStaleRooms([fresh, stale], fresh.updatedAt + 1000).map((room) => room.code)).toEqual(["ABCDE"]);
  });

  it("knows when rooms are joinable", () => {
    const room = createVolleyballRoomSummary({
      hostId: "a",
      hostName: "Ari",
      mode: "2v2",
      targetScore: 11,
      playerCount: 3
    });
    expect(isRoomJoinable(room)).toBe(true);
    expect(isRoomJoinable({ ...room, playerCount: 4 })).toBe(false);
    expect(isRoomJoinable({ ...room, status: "playing" })).toBe(false);
  });
});

describe("volleyball player assignment", () => {
  it("assigns 1v1 and 2v2 teams in alternating order", () => {
    expect(getMaxPlayers("1v1")).toBe(2);
    expect(getMaxPlayers("2v2")).toBe(4);
    expect(assignVolleyballTeams(players, "1v1").map((player) => player.team)).toEqual(["sun", "tide"]);
    expect(assignVolleyballTeams(players, "2v2").map((player) => `${player.team}-${player.slot}`)).toEqual([
      "sun-0",
      "tide-0",
      "sun-1",
      "tide-1"
    ]);
  });

  it("switches modes and trims players", () => {
    const state = createInitialVolleyballState(players, "2v2", 7);
    const next = configureVolleyballPlayers(state, players, "1v1", 11);
    expect(next.mode).toBe("1v1");
    expect(next.players).toHaveLength(2);
    expect(next.targetScore).toBe(11);
  });
});

describe("volleyball scoring and hit math", () => {
  it("scores, resets, and declares game over at target score", () => {
    const state = startVolleyballMatch(players.slice(0, 2), "1v1", 3);
    const scored = applyPoint(state, "sun");
    expect(scored.score.sun).toBe(1);
    expect(scored.phase).toBe("point");
    const reset = resetForServe(scored);
    expect(reset.phase).toBe("countdown");
    const final = applyPoint({ ...state, score: { sun: 2, tide: 1 } }, "sun");
    expect(final.phase).toBe("gameOver");
    expect(final.winner).toBe("sun");
  });

  it("calculates distinct ball velocities for bump, set, spike, and dive", () => {
    const player = assignVolleyballTeams(players, "1v1")[0];
    const ball = { x: player.x + 20, y: player.y - 40, vx: 0, vy: 0 };
    const bump = calculateHitVelocity("bump", player, ball);
    const set = calculateHitVelocity("set", player, ball);
    const spike = calculateHitVelocity("spike", { ...player, grounded: false }, ball);
    const dive = calculateHitVelocity("dive", player, ball);
    expect(set.vy).toBeLessThan(bump.vy);
    expect(spike.vy).toBeGreaterThan(0);
    expect(Math.abs(dive.vx)).toBeGreaterThan(Math.abs(bump.vx));
  });

  it("advances countdown and awards a point when the ball hits sand", () => {
    const state = startVolleyballMatch(players.slice(0, 2), "1v1", 7);
    const playing = stepVolleyballState(state, {}, 2500);
    const dropped = {
      ...playing,
      ball: { ...playing.ball, x: 240, y: 450, vy: 260 }
    };
    const scored = stepVolleyballState(dropped, {}, 34);
    expect(scored.phase).toBe("point");
    expect(scored.score.tide).toBe(1);
  });
});
