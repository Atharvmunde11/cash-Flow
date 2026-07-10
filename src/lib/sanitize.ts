/**
 * Strip HTML for safe plain-text display. React escapes text nodes; this removes
 * markup so notes/descriptions never render as HTML if a caller changes later.
 */
export function sanitizeHtml(value: string): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").replace(/\0/g, "").trim();
}

/** Escape for plain text (defense in depth). */
export function escapeHtml(value: string): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
