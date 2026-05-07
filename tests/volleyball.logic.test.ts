import { describe, expect, it } from "vitest";
import {
  createHarnessPlayer,
  createHarnessRoom,
  harnessChangeMode,
  harnessJoin,
  harnessLeave,
  harnessStart
} from "../src/lib/volleyball/devHarness";
import {
  applyPoint,
  assignVolleyballTeams,
  canStartVolleyballMatch,
  calculateHitVelocity,
  configureVolleyballPlayers,
  createInitialVolleyballState,
  getMaxPlayers,
  getOpponentTeam,
  resetForServe,
  startVolleyballMatch,
  stepVolleyballState,
  type VolleyballPresencePlayer
} from "../src/lib/volleyball/logic";
import {
  createVolleyballRoomSummary,
  isRoomJoinable,
  normalizeRoomCode,
  pruneStaleRooms,
  reassignRoomHost,
  updateRoomPlayerCount
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
    expect(isRoomJoinable({ ...room, hostId: "" })).toBe(false);
  });

  it("updates capacity, host reassignment, and full-room rejection", () => {
    const room = createVolleyballRoomSummary({
      hostId: "a",
      hostName: "Ari",
      mode: "1v1",
      targetScore: 7,
      playerCount: 1
    });
    expect(updateRoomPlayerCount(room, 9).playerCount).toBe(2);
    expect(reassignRoomHost(room, players.slice(1, 3))?.hostId).toBe("b");
    expect(reassignRoomHost(room, [])).toBeNull();
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

  it("requires exact room capacity before start", () => {
    expect(canStartVolleyballMatch(players.slice(0, 1), "1v1")).toBe(false);
    expect(canStartVolleyballMatch(players.slice(0, 2), "1v1")).toBe(true);
    expect(canStartVolleyballMatch(players.slice(0, 3), "1v1")).toBe(false);
    expect(canStartVolleyballMatch(players.slice(0, 4), "2v2")).toBe(true);
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
    expect(spike.vy).toBeGreaterThan(set.vy);
    expect(Math.abs(spike.vx)).toBeGreaterThan(Math.abs(bump.vx));
    expect(Math.abs(dive.vx)).toBeGreaterThan(Math.abs(bump.vx));
  });

  it("aims airborne spikes across the net before they drop", () => {
    const tide = assignVolleyballTeams(players, "1v1")[1];
    const ball = { x: tide.x - 35, y: 252, vx: 0, vy: 0 };
    const spike = calculateHitVelocity("spike", { ...tide, grounded: false }, ball);
    const timeToNet = Math.abs((ball.x - 480) / spike.vx);
    const yAtNet = ball.y + spike.vy * timeToNet + 0.5 * 980 * timeToNet * timeToNet;
    expect(spike.vx).toBeLessThan(0);
    expect(yAtNet).toBeLessThan(306 - 14);
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

  it("enforces three hits per side and resets possession on a clean net crossing", () => {
    let state = startVolleyballMatch(players.slice(0, 2), "1v1", 7);
    state = { ...state, phase: "playing", countdownMs: 0, possessionTeam: "sun", sideHitCount: 3 };
    const sun = state.players[0];
    const faulted = stepVolleyballState({
      ...state,
      ball: { x: sun.x + 10, y: sun.y - 24, vx: 0, vy: 20, lastTeam: "tide" }
    }, { [sun.id]: { bump: true } }, 16);
    expect(faulted.phase).toBe("point");
    expect(faulted.score[getOpponentTeam("sun")]).toBe(1);

    const crossed = stepVolleyballState({
      ...state,
      sideHitCount: 2,
      ball: { x: 476, y: 240, vx: 400, vy: 0, lastTeam: "sun" }
    }, {}, 34);
    expect(crossed.possessionTeam).toBe("tide");
    expect(crossed.sideHitCount).toBe(0);
  });

  it("does not count one spike contact as an immediate extra touch fault", () => {
    const base = startVolleyballMatch(players.slice(0, 2), "1v1", 7);
    const tide = base.players[1];
    const state = {
      ...base,
      phase: "playing" as const,
      countdownMs: 0,
      possessionTeam: "tide" as const,
      sideHitCount: 2,
      players: base.players.map((player) => player.id === tide.id
        ? { ...player, action: "spike" as const, actionMs: 240, grounded: false, y: 360 }
        : player),
      ball: { x: tide.x - 8, y: 302, vx: 0, vy: 40, lastTeam: "tide" as const }
    };

    const afterContact = stepVolleyballState(state, {}, 16);
    expect(afterContact.phase).toBe("playing");
    expect(afterContact.sideHitCount).toBe(3);

    const afterNextFrame = stepVolleyballState(afterContact, {}, 16);
    expect(afterNextFrame.phase).toBe("playing");
    expect(afterNextFrame.score.sun).toBe(0);
  });
});

describe("volleyball development harness", () => {
  it("simulates 1v1 join, start, leave, and host reassignment", () => {
    let room = createHarnessRoom("1v1", 7);
    expect(harnessStart(room).started).toBe(false);
    const joinResult = harnessJoin(room, createHarnessPlayer(2));
    room = joinResult.room;
    expect(joinResult.joined).toBe(true);
    expect(harnessJoin(room, createHarnessPlayer(3)).joined).toBe(false);
    const started = harnessStart(room);
    expect(started.started).toBe(true);
    expect(started.room.state?.players).toHaveLength(2);
    const afterHostLeave = harnessLeave(started.room, "harness-player-1");
    expect(afterHostLeave?.summary.hostId).toBe("harness-player-2");
    expect(afterHostLeave?.state).toBeNull();
  });

  it("simulates 2v2 capacity and mode changes before start", () => {
    let room = harnessChangeMode(createHarnessRoom("1v1"), "2v2");
    for (let index = 2; index <= 4; index += 1) {
      room = harnessJoin(room, createHarnessPlayer(index)).room;
    }
    expect(room.players).toHaveLength(4);
    expect(harnessStart(room).started).toBe(true);
    const switched = harnessChangeMode(room, "1v1");
    expect(switched.players).toHaveLength(2);
    expect(switched.summary.maxPlayers).toBe(2);
  });
});
