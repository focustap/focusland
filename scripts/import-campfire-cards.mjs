#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [, , csvPath, outputPath = "src/lib/campfire-cards/importedPartyPack.ts"] = process.argv;

if (!csvPath) {
  console.error("Usage: node scripts/import-campfire-cards.mjs path/to/cards.csv [output.ts]");
  process.exit(1);
}

const source = fs.readFileSync(csvPath, "utf8");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

function normalizeCard(text) {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeKey(text) {
  return normalizeCard(text)
    .toLowerCase()
    .replace(/_{2,}/g, "______")
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMultiAnswerPrompt(text) {
  const upper = text.toUpperCase();
  const blankCount = (text.match(/_{2,}/g) ?? []).length;
  return (
    blankCount > 1 ||
    /\bPICK\s*[2-9]\b/.test(upper) ||
    /\bDRAW\s*[2-9]\b/.test(upper) ||
    /\bTAKE\s*[2-9]\b/.test(upper) ||
    /\b\d+\s+ANSWERS?\b/.test(upper)
  );
}

function extractRows(rows) {
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const typeIndex = header.findIndex((cell) => ["type", "card type", "kind"].includes(cell));
  const textIndex = header.findIndex((cell) => ["text", "card", "card text", "content"].includes(cell));
  const prompts = [];
  const answers = [];

  if (typeIndex >= 0 && textIndex >= 0) {
    for (const row of rows.slice(1)) {
      const type = normalizeCard(row[typeIndex] ?? "").toLowerCase();
      const text = normalizeCard(row[textIndex] ?? "");
      if (!text) continue;
      if (type.includes("prompt") || type.includes("black")) prompts.push(text);
      if (type.includes("response") || type.includes("answer") || type.includes("white")) answers.push(text);
    }
    return { prompts, answers };
  }

  for (const row of rows) {
    for (const rawCell of row) {
      const cell = normalizeCard(rawCell);
      const match = /^(Prompt|Response|Answer)\s+(.+)$/i.exec(cell);
      if (!match) continue;
      const text = normalizeCard(match[2]);
      if (match[1].toLowerCase() === "prompt") prompts.push(text);
      else answers.push(text);
    }
  }

  return { prompts, answers };
}

function dedupeCards(cards) {
  const seen = new Set();
  const unique = [];
  for (const card of cards) {
    const key = dedupeKey(card);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  return unique;
}

const rows = parseCsv(source);
const extracted = extractRows(rows);
const prompts = dedupeCards(extracted.prompts.filter((text) => !isMultiAnswerPrompt(text)));
const answers = dedupeCards(extracted.answers);

const body = `import type { CampfireCardPack } from "./packs";

export const IMPORTED_PARTY_PACK_SOURCE =
  "Generated from a user-provided CSV. Verify that the source text is original or permissively licensed before committing.";

export const IMPORTED_PARTY_PACK: CampfireCardPack = {
  id: "imported-party",
  name: "Imported Party Pack",
  description: "Default-off imported one-answer prompt and response cards.",
  prompts: ${JSON.stringify(prompts, null, 2)},
  answers: ${JSON.stringify(answers, null, 2)}
};
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, body);
console.log(`Imported ${prompts.length} one-answer prompts and ${answers.length} answers into ${outputPath}.`);
