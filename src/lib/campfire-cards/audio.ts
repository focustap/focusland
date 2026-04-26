type CampfireAudioKind = "deal" | "submit" | "reveal" | "pick" | "win" | "error";

export type CampfireAudioController = {
  setMuted: (muted: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  play: (kind: CampfireAudioKind) => void;
  stop: () => void;
};

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export function createCampfireAudioController(): CampfireAudioController {
  let muted = false;
  let musicEnabled = false;
  const music = new Audio(assetUrl("assets/campfire-cards/audio/doodle-menu-like-song.mp3"));
  const ambience = new Audio(assetUrl("assets/campfire-cards/audio/campfire-sound-ambience.ogg"));
  const sfx = {
    deal: assetUrl("assets/campfire-cards/audio/card-drop.ogg"),
    submit: assetUrl("assets/campfire-cards/audio/ui-confirm.ogg"),
    reveal: assetUrl("assets/campfire-cards/audio/reveal.ogg"),
    pick: assetUrl("assets/campfire-cards/audio/ui-click.ogg"),
    win: assetUrl("assets/campfire-cards/audio/ui-confirm.ogg"),
    error: assetUrl("assets/campfire-cards/audio/ui-error.ogg")
  };

  music.loop = true;
  music.preload = "auto";
  music.volume = 0.22;
  ambience.loop = true;
  ambience.preload = "auto";
  ambience.volume = 0.18;

  const syncMusic = () => {
    if (musicEnabled && !muted) {
      void music.play().catch(() => undefined);
      void ambience.play().catch(() => undefined);
    } else {
      music.pause();
      ambience.pause();
    }
  };

  return {
    setMuted(nextMuted) {
      muted = nextMuted;
      syncMusic();
    },
    setMusicEnabled(enabled) {
      musicEnabled = enabled;
      syncMusic();
    },
    play(kind) {
      if (muted) return;
      const audio = new Audio(sfx[kind]);
      audio.volume = kind === "error" ? 0.18 : 0.24;
      void audio.play().catch(() => undefined);
    },
    stop() {
      music.pause();
      ambience.pause();
    }
  };
}
