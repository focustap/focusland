export const KENNEY_PROMPTS = {
  a: "/assets/kenney/ui/keyboard_a.png",
  d: "/assets/kenney/ui/keyboard_d.png",
  e: "/assets/kenney/ui/keyboard_e.png",
  mouseLeft: "/assets/kenney/ui/mouse_left.png",
  r: "/assets/kenney/ui/keyboard_r.png",
  shift: "/assets/kenney/ui/keyboard_shift.png",
  space: "/assets/kenney/ui/keyboard_space.png",
  w: "/assets/kenney/ui/keyboard_w.png"
} as const;

export const KENNEY_PARTICLES = {
  flame: "/assets/kenney/particles/flame_04.png",
  magic: "/assets/kenney/particles/magic_03.png",
  slash: "/assets/kenney/particles/slash_03.png",
  smoke: "/assets/kenney/particles/smoke_05.png",
  spark: "/assets/kenney/particles/spark_06.png"
} as const;

export const KENNEY_SFX = {
  hazard: ["/assets/kenney/sfx/impactMining_002.ogg"],
  hit: [
    "/assets/kenney/sfx/impactPunch_medium_000.ogg",
    "/assets/kenney/sfx/impactPunch_heavy_001.ogg"
  ],
  ult: ["/assets/kenney/sfx/impactPlate_heavy_001.ogg"],
  win: ["/assets/kenney/sfx/impactBell_heavy_003.ogg"]
} as const;

export type KenneyParticleKey = keyof typeof KENNEY_PARTICLES;
export type KenneySfxKey = keyof typeof KENNEY_SFX;

type EffectLike = {
  color: string;
  radius: number;
  x2?: number;
  y2?: number;
};

export function createKenneyAudioPools(poolSize = 4) {
  return Object.fromEntries(
    Object.entries(KENNEY_SFX).map(([kind, urls]) => [
      kind,
      urls.flatMap((url) =>
        Array.from({ length: poolSize }, () => {
          const audio = new Audio(url);
          audio.preload = "auto";
          return audio;
        })
      )
    ])
  ) as Record<KenneySfxKey, HTMLAudioElement[]>;
}

export function playKenneySfx(
  pools: Record<KenneySfxKey, HTMLAudioElement[]>,
  kind: KenneySfxKey,
  volume = 0.5
) {
  const pool = pools[kind];
  if (!pool || pool.length === 0) return;
  const audio = pool.find((entry) => entry.paused || entry.ended) ?? pool[0];
  audio.pause();
  audio.currentTime = 0;
  audio.volume = volume;
  void audio.play().catch(() => {
    // Ignore autoplay or decode failures so gameplay is unaffected.
  });
}

export function loadKenneyParticleImages() {
  return Object.fromEntries(
    Object.entries(KENNEY_PARTICLES).map(([key, src]) => {
      const image = new Image();
      image.src = src;
      return [key, image];
    })
  ) as Record<KenneyParticleKey, HTMLImageElement>;
}

export function getKenneyParticleKey(effect: EffectLike): KenneyParticleKey | null {
  if (typeof effect.x2 === "number" && typeof effect.y2 === "number") {
    return null;
  }

  const color = effect.color.toLowerCase();
  if (color.includes("#86efac") || color.includes("#67e8f9") || color.includes("#22d3ee")) {
    return "magic";
  }
  if (
    color.includes("#fb923c") ||
    color.includes("#f97316") ||
    color.includes("#fef08a") ||
    color.includes("#fdba74")
  ) {
    return effect.radius >= 22 ? "flame" : "spark";
  }
  if (
    color.includes("#e2e8f0") ||
    color.includes("#cbd5e1") ||
    color.includes("#94a3b8") ||
    color.includes("#fff7ed")
  ) {
    return effect.radius >= 24 ? "smoke" : "spark";
  }
  if (effect.radius >= 16) {
    return "slash";
  }
  return "spark";
}

