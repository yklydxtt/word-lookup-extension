import type { Preferences } from '../core/types';

export function defaultPreferences(): Preferences {
  return { schemaVersion: 1, enabled: true, disabledHosts: [] };
}

export function normalizeHostname(value: string): string | null {
  try {
    const hostname = value.toLowerCase();
    const parsed = new URL(`https://${hostname}`);
    return parsed.hostname === hostname && parsed.host === hostname && parsed.pathname === '/'
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      ? hostname : null;
  } catch {
    return null;
  }
}

export function parsePreferences(value: unknown): Preferences {
  if (value === undefined) return defaultPreferences();
  if (typeof value !== 'object' || value === null) throw new Error('本地设置损坏');
  const candidate = value as Partial<Preferences>;
  if (candidate.schemaVersion !== 1 || typeof candidate.enabled !== 'boolean'
    || !Array.isArray(candidate.disabledHosts)
    || candidate.disabledHosts.some(host => typeof host !== 'string' || normalizeHostname(host) !== host)) {
    throw new Error('本地设置损坏');
  }
  return { schemaVersion: 1, enabled: candidate.enabled, disabledHosts: [...new Set(candidate.disabledHosts)].sort() };
}

export function isEnabled(preferences: Preferences, hostname: string): boolean {
  return preferences.enabled && !preferences.disabledHosts.includes(hostname.toLowerCase());
}

export function setSite(preferences: Preferences, hostname: string, enabled: boolean): Preferences {
  const normalized = normalizeHostname(hostname);
  if (!normalized) throw new Error('网站域名无效');
  const disabledHosts = new Set(preferences.disabledHosts);
  if (enabled) disabledHosts.delete(normalized);
  else disabledHosts.add(normalized);
  return { ...preferences, disabledHosts: [...disabledHosts].sort() };
}
