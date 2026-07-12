/** Locale-independent UTF-16 code-unit ordering for deterministic entity/content IDs. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
