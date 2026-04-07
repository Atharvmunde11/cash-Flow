export function sanitizeHtml(value: string): string {
  if (typeof value !== "string") return "";

  // Remove <script>...</script> blocks
  let sanitized = value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

  // Remove inline event handlers (onClick, onmouseover etc.)
  sanitized = sanitized.replace(/on\w+\s*=\s*(['"]).*?\1/gi, "");

  // Remove javascript: URIs for safety inside href/src attributes
  sanitized = sanitized.replace(
    /(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi,
    "$1=$2#$2",
  );

  return sanitized;
}
