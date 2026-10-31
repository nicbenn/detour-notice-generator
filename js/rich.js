export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** ==yellow== and **bold** in notice text. */
export function richHtml(value) {
  return escapeHtml(value)
    .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replaceAll("\n", "<br>");
}
