const musicUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const COMBAT_MUSIC = {
  pve: musicUrl("assets/music/brawl-pve.mp3"),
  pvp: musicUrl("assets/music/brawl-pvp.mp3")
} as const;

export function createLoopingTrack(src: string, volume = 0.42) {
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = volume;
  return audio;
}

