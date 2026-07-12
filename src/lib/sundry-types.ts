export const SUNDRY_PRESETS = [
  "Transport",
  "Labour",
  "Due",
  "Round off",
  "Discount",
] as const;

const FORBIDDEN_SUNDRY_NAMES = [
  "walk-in",
  "walk in",
  "walkin",
  "type-in",
  "type in",
  "typein",
  "custom",
  "other",
  "misc",
  "miscellaneous",
  "sundry",
];

export function isForbiddenSundryName(name: string) {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  return FORBIDDEN_SUNDRY_NAMES.includes(key);
}

export function isPresetSundry(name: string) {
  const key = name.trim().toLowerCase();
  return (SUNDRY_PRESETS as readonly string[]).some(
    (p) => p.toLowerCase() === key,
  );
}

export function isAllowedSundryLabel(
  label: string,
  customNames: string[],
): boolean {
  const trimmed = label.trim();
  if (!trimmed || isForbiddenSundryName(trimmed)) return false;
  if (isPresetSundry(trimmed)) return true;
  const key = trimmed.toLowerCase();
  return customNames.some((n) => n.trim().toLowerCase() === key);
}
