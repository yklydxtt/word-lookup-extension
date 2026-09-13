import type { Preferences } from '../core/types';

export function popupState(preferences: Preferences, hostname: string | null, available: boolean) {
  return {
    globalChecked: preferences.enabled,
    siteChecked: Boolean(hostname && !preferences.disabledHosts.includes(hostname)),
    siteDisabled: !preferences.enabled || !hostname || !available,
    status: !available
      ? '当前页面不可用；普通网页可刷新后重试'
      : !preferences.enabled ? '划词查词已暂停'
        : hostname && preferences.disabledHosts.includes(hostname) ? '已在当前网站停用' : '当前网站已启用',
  };
}
