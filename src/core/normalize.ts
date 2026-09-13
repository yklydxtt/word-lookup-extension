export function canonicalWord(value: string): string | null {
  const normalized = value.trim().replace(/[‘’]/gu, "'").toLowerCase();
  return /^[a-z]+(?:[-'][a-z]+)*$/u.test(normalized) ? normalized : null;
}

export function normalizeSelection(value: string): string | null {
  return canonicalWord(value.trim().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ''));
}
