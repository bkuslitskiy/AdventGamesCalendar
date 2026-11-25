/** JSON.stringify with [row, col] pairs and short string arrays kept on one line. */
export function pretty(value) {
  return JSON.stringify(value, null, 2)
    .replace(/\[\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1, $2]')
    .replace(/"path": \[\s+((?:\[\d+, \d+\],?\s*)+)\]/g, (_, inner) => `"path": [${inner.trim().split(/,\s*(?=\[)/).join(', ')}]`);
}
