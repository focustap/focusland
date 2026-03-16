export const DEFAULT_PROFILE_COLOR = "#38bdf8";

export function normalizeProfileColor(color?: string | null) {
  if (!color) {
    return DEFAULT_PROFILE_COLOR;
  }

  const trimmed = color.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }

  return DEFAULT_PROFILE_COLOR;
}

export function profileColorToNumber(color?: string | null) {
  return parseInt(normalizeProfileColor(color).slice(1), 16);
}
