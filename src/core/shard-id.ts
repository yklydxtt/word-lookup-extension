export function shardId(word: string): string {
  let hash = 2166136261;
  for (const character of word) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return (hash & 255).toString(16).padStart(2, '0');
}
