import type { Preferences } from '../core/types';
import { parsePreferences, setSite } from './model';

export interface PreferencesStorage {
  read(): Promise<unknown>;
  write(value: Preferences): Promise<void>;
}

export interface PreferencesStore {
  read(): Promise<Preferences>;
  setGlobal(enabled: boolean): Promise<Preferences>;
  setSite(hostname: string, enabled: boolean): Promise<Preferences>;
}

export function createPreferencesStore(storage: PreferencesStorage): PreferencesStore {
  let queue: Promise<unknown> = Promise.resolve();

  function update(change: (preferences: Preferences) => Preferences): Promise<Preferences> {
    const action = queue.then(async () => {
      const next = change(parsePreferences(await storage.read()));
      await storage.write(next);
      return next;
    });
    queue = action.catch(() => {});
    return action;
  }

  return {
    async read() {
      await queue;
      return parsePreferences(await storage.read());
    },
    setGlobal: enabled => update(preferences => ({ ...preferences, enabled })),
    setSite: (hostname, enabled) => update(preferences => setSite(preferences, hostname, enabled)),
  };
}
