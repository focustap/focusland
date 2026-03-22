const audioUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const TAPDECK_AUDIO = {
  deckRoom: audioUrl("audio/tapdeck/deck-room.mp3"),
  battleTracks: [
    audioUrl("audio/tapdeck/battle-1.mp3"),
    audioUrl("audio/tapdeck/battle-2.mp3"),
    audioUrl("audio/tapdeck/battle-3.mp3")
  ]
} as const;

export function createTapDeckTrack(src: string, volume = 0.34) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = volume;
  return audio;
}

export function ensureAudioPlayback(audio: HTMLAudioElement) {
  const tryPlay = () => {
    void audio.play().catch(() => undefined);
  };

  tryPlay();

  const unlock = () => {
    tryPlay();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

export function syncTrackToTimestamp(audio: HTMLAudioElement, startAtMs: number) {
  const offsetSeconds = Math.max(0, (Date.now() - startAtMs) / 1000);
  if (Number.isFinite(offsetSeconds)) {
    audio.currentTime = offsetSeconds;
  }
}
