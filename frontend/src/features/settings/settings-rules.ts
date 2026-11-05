import type { SettingsPatch, UserSettings } from './types';

/** 바뀐 필드만 골라 PATCH /me/settings 본문을 만든다. 바뀐 게 없으면 null */
export function settingsPatch(previous: UserSettings, next: UserSettings): SettingsPatch | null {
  const changed = <T extends object>(a: T, b: T) => {
    const out: Partial<T> = {};
    for (const key of Object.keys(b) as (keyof T)[]) if (a[key] !== b[key]) out[key] = b[key];
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const ai = changed(previous.ai, next.ai);
  const notifications = changed(previous.notifications, next.notifications);
  if (!ai && !notifications) return null;
  return {
    expectedVersion: previous.version,
    ...(ai ? { ai } : {}),
    ...(notifications ? { notifications } : {}),
  };
}
