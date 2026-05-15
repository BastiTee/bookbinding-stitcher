import LZString from "lz-string";

const HASH_PREFIX = "p=";

export function encodePatternUrl(json: string): string {
  const compressed = LZString.compressToEncodedURIComponent(json);
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL;
  return `${origin}${base}#${HASH_PREFIX}${compressed}`;
}

export function readPatternFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith(`#${HASH_PREFIX}`)) return null;
  const encoded = hash.slice(HASH_PREFIX.length + 1);
  return LZString.decompressFromEncodedURIComponent(encoded) ?? null;
}
