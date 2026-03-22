import type { CardRarity } from "./card-game/packOpening";

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioContext) {
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) {
      return null;
    }
    audioContext = new Context();
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  return audioContext;
}

function createTone(context: AudioContext, params: {
  startTime: number;
  duration: number;
  frequency: number;
  endFrequency?: number;
  gain: number;
  type?: OscillatorType;
}) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = params.type ?? "sine";
  oscillator.frequency.setValueAtTime(params.frequency, params.startTime);
  if (params.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(params.endFrequency, params.startTime + params.duration);
  }

  gainNode.gain.setValueAtTime(0.0001, params.startTime);
  gainNode.gain.exponentialRampToValueAtTime(params.gain, params.startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, params.startTime + params.duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(params.startTime);
  oscillator.stop(params.startTime + params.duration + 0.02);
}

export function playPackChargeSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  createTone(context, { startTime: now, duration: 0.55, frequency: 120, endFrequency: 240, gain: 0.04, type: "sawtooth" });
  createTone(context, { startTime: now + 0.22, duration: 0.46, frequency: 230, endFrequency: 460, gain: 0.03, type: "triangle" });
}

export function playPackBurstSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  createTone(context, { startTime: now, duration: 0.22, frequency: 260, endFrequency: 80, gain: 0.09, type: "sawtooth" });
  createTone(context, { startTime: now + 0.04, duration: 0.44, frequency: 420, endFrequency: 1200, gain: 0.05, type: "triangle" });
}

export function playRevealSound(rarity: CardRarity) {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const patternByRarity: Record<CardRarity, number[]> = {
    common: [392, 494],
    uncommon: [440, 554.37, 659.25],
    rare: [523.25, 659.25, 783.99],
    epic: [659.25, 783.99, 987.77, 1174.66],
    legendary: [783.99, 987.77, 1174.66, 1567.98]
  };

  patternByRarity[rarity].forEach((frequency, index) => {
    createTone(context, {
      startTime: now + index * 0.07,
      duration: 0.24 + index * 0.02,
      frequency,
      endFrequency: frequency * 1.08,
      gain: rarity === "legendary" ? 0.065 : rarity === "epic" ? 0.05 : 0.036,
      type: index % 2 === 0 ? "triangle" : "sine"
    });
  });
}
