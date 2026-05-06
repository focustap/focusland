import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "public", "assets", "volleyball");
mkdirSync(outDir, { recursive: true });

const writeSvg = (name, width, height, body) => {
  writeFileSync(
    join(outDir, `${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`,
    "utf8"
  );
};

const playerFrame = ({ body = "#f97316", shorts = "#0ea5e9", pose = "idle", lean = 0 }) => {
  const arm =
    pose === "set"
      ? `<path d="M24 28 C12 13 13 6 20 5" stroke="#5b3928" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M40 28 C52 13 51 6 44 5" stroke="#5b3928" stroke-width="6" stroke-linecap="round" fill="none"/>`
      : pose === "spike"
        ? `<path d="M38 25 C50 8 54 5 57 12" stroke="#5b3928" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M24 30 C14 28 11 37 15 43" stroke="#5b3928" stroke-width="6" stroke-linecap="round" fill="none"/>`
        : pose === "dive"
          ? `<path d="M22 33 C8 30 5 22 9 17" stroke="#5b3928" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M42 35 C55 32 60 26 58 20" stroke="#5b3928" stroke-width="6" stroke-linecap="round" fill="none"/>`
          : pose === "bump"
            ? `<path d="M21 38 C29 48 38 48 46 38" stroke="#5b3928" stroke-width="7" stroke-linecap="round" fill="none"/>`
            : `<path d="M23 32 C14 38 14 48 20 51" stroke="#5b3928" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M41 32 C50 38 50 48 44 51" stroke="#5b3928" stroke-width="6" stroke-linecap="round" fill="none"/>`;
  const leg =
    pose === "run"
      ? `<path d="M27 60 L17 73" stroke="#5b3928" stroke-width="7" stroke-linecap="round"/><path d="M38 60 L51 72" stroke="#5b3928" stroke-width="7" stroke-linecap="round"/>`
      : pose === "jump" || pose === "spike"
        ? `<path d="M27 60 L21 70" stroke="#5b3928" stroke-width="7" stroke-linecap="round"/><path d="M39 60 L48 67" stroke="#5b3928" stroke-width="7" stroke-linecap="round"/>`
        : pose === "dive"
          ? `<path d="M27 58 L10 62" stroke="#5b3928" stroke-width="7" stroke-linecap="round"/><path d="M39 58 L56 61" stroke="#5b3928" stroke-width="7" stroke-linecap="round"/>`
          : `<path d="M27 60 L24 74" stroke="#5b3928" stroke-width="7" stroke-linecap="round"/><path d="M38 60 L41 74" stroke="#5b3928" stroke-width="7" stroke-linecap="round"/>`;
  return `
    <g transform="translate(0 ${pose === "jump" || pose === "spike" ? -5 : pose === "dive" ? 14 : 0}) rotate(${lean} 32 42)">
      <ellipse cx="32" cy="78" rx="22" ry="5" fill="#0f172a" opacity=".18"/>
      ${leg}
      <path d="M23 39 C21 28 28 22 35 23 C45 24 48 35 43 50 L40 62 L25 62 Z" fill="${body}" stroke="#3b241b" stroke-width="3" stroke-linejoin="round"/>
      <path d="M23 55 L42 55 L40 65 L25 65 Z" fill="${shorts}"/>
      ${arm}
      <circle cx="33" cy="17" r="13" fill="#7c4a33" stroke="#3b241b" stroke-width="3"/>
      <path d="M21 15 C25 4 42 2 47 14 C39 10 31 13 21 15Z" fill="#14213d"/>
      <circle cx="38" cy="18" r="2" fill="#f8fafc"/>
    </g>`;
};

[
  ["player-idle", { pose: "idle" }],
  ["player-run-1", { pose: "run", lean: -6 }],
  ["player-run-2", { pose: "run", lean: 6 }],
  ["player-jump", { pose: "jump" }],
  ["player-bump", { pose: "bump" }],
  ["player-set", { pose: "set" }],
  ["player-spike", { pose: "spike", lean: -10 }],
  ["player-dive", { pose: "dive", lean: 82 }]
].forEach(([name, config]) => writeSvg(name, 64, 88, playerFrame(config)));

writeSvg("volleyball", 40, 40, `
  <circle cx="20" cy="20" r="17" fill="#fff7ed" stroke="#0f172a" stroke-width="2"/>
  <path d="M7 15 C15 17 20 25 19 37" fill="none" stroke="#f97316" stroke-width="3"/>
  <path d="M18 3 C19 13 28 20 37 20" fill="none" stroke="#0ea5e9" stroke-width="3"/>
  <path d="M8 28 C17 24 26 27 33 34" fill="none" stroke="#f59e0b" stroke-width="3"/>
`);

writeSvg("net", 96, 228, `
  <rect x="41" y="0" width="14" height="228" rx="5" fill="#f8fafc" stroke="#0f172a" stroke-width="3"/>
  <rect x="17" y="18" width="62" height="150" rx="3" fill="rgba(255,255,255,.18)" stroke="#e0f2fe" stroke-width="3"/>
  ${Array.from({ length: 6 }, (_, i) => `<path d="M17 ${42 + i * 21} H79" stroke="#e0f2fe" stroke-width="2" opacity=".75"/>`).join("")}
  ${Array.from({ length: 4 }, (_, i) => `<path d="M${29 + i * 12} 18 V168" stroke="#e0f2fe" stroke-width="2" opacity=".6"/>`).join("")}
`);

writeSvg("sand-court", 960, 170, `
  <rect width="960" height="170" fill="#f4c56f"/>
  <path d="M0 22 C170 5 290 42 480 20 C650 0 760 31 960 18 V170 H0Z" fill="#e9ad50" opacity=".32"/>
  <path d="M64 38 H896 M480 22 V152 M44 120 H916" stroke="#fff7d6" stroke-width="5" stroke-linecap="round" opacity=".58"/>
  ${Array.from({ length: 46 }, (_, i) => `<circle cx="${(i * 83) % 940 + 10}" cy="${(i * 37) % 130 + 22}" r="${(i % 3) + 1}" fill="#b77933" opacity=".32"/>`).join("")}
`);

writeSvg("beach-background", 960, 540, `
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#7dd3fc"/><stop offset=".62" stop-color="#bae6fd"/><stop offset="1" stop-color="#fef3c7"/></linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#sky)"/>
  <circle cx="818" cy="76" r="42" fill="#fde68a"/>
  <path d="M0 292 C148 254 265 296 421 266 C596 232 724 281 960 244 V540 H0Z" fill="#38bdf8" opacity=".68"/>
  <path d="M0 318 C168 282 288 331 475 300 C650 272 768 315 960 285 V540 H0Z" fill="#0ea5e9" opacity=".55"/>
  <path d="M0 374 C220 336 322 383 503 356 C690 329 785 360 960 342 V540 H0Z" fill="#f4c56f"/>
  <path d="M92 134 C143 123 196 135 238 160" stroke="#fff" stroke-width="5" fill="none" opacity=".78"/>
  <path d="M274 105 C330 94 378 107 424 133" stroke="#fff" stroke-width="5" fill="none" opacity=".62"/>
  <path d="M76 290 C104 249 134 222 177 205" stroke="#7c4a33" stroke-width="14" stroke-linecap="round"/>
  <path d="M172 207 C140 202 111 211 83 232 C123 171 160 151 219 147 C200 169 190 189 172 207Z" fill="#22c55e"/>
  <path d="M175 207 C188 175 215 151 262 132 C252 180 221 204 175 207Z" fill="#16a34a"/>
`);
