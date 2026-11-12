import { describe, expect, it } from '@jest/globals';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { createNotificationMock } from './dev-mock-notification';

type Page = {
  data: { id: string; readAt: string | null; createdAt: string }[];
  page: { hasNext: boolean };
};

function setup() {
  const mock = createNotificationMock({
    ok: <T>(config: InternalAxiosRequestConfig, data: T, status = 200) =>
      ({ data, status, config, headers: {}, statusText: '' }) as AxiosResponse<T>,
    fail: (_config, status, code) => Object.assign(new Error(code), { status, code }),
  });
  const call = (method: string, url: string, params: Record<string, string> = {}, body?: unknown) =>
    mock.handle(
      { url, params, data: body ? JSON.stringify(body) : undefined } as InternalAxiosRequestConfig,
      method,
      url,
      params,
    )?.data as unknown;
  return { mock, call };
}

describe('테스트 모드 가짜 알림 서버', () => {
  it('목록, 안 읽은 것만, 쪽 나누기', () => {
    const { call } = setup();
    const all = call('get', '/me/notifications', { limit: '20' }) as Page;
    expect(all.data).toHaveLength(9);
    const unread = call('get', '/me/notifications', { unreadOnly: 'true' }) as Page;
    expect(unread.data).toHaveLength(3);
    const first = call('get', '/me/notifications', { limit: '5' }) as Page;
    expect(first.page.hasNext).toBe(true);
  });

  it('읽음, 지우기, 모두 읽음이 요약 숫자에 반영된다', () => {
    const { call } = setup();
    const count = () =>
      (call('get', '/me/notification-summary') as { data: { unreadCount: number } }).data
        .unreadCount;
    const [first, second] = (call('get', '/me/notifications', { unreadOnly: 'true' }) as Page).data;
    expect(count()).toBe(3);
    call('patch', `/me/notifications/${first.id}`, {}, { read: true });
    expect(count()).toBe(2);
    call('delete', `/me/notifications/${second.id}`);
    expect((call('get', '/me/notifications') as Page).data).toHaveLength(8);
    call('post', '/me/notifications/read-all', {}, { through: new Date().toISOString() });
    expect(count()).toBe(0);
  });

  it('소식 읽음은 같은 소식의 알림을 읽음으로 바꾸고, 없는 소식은 404', () => {
    const { call, mock } = setup();
    const target = mock.controls.peek().find((n) => n.readAt === null)!;
    const count = () =>
      (call('get', '/me/notification-summary') as { data: { unreadCount: number } }).data
        .unreadCount;
    const before = count();

    const res = call('post', `/me/events/${target.eventId}/read`) as {
      data: { eventId: string; readAt: string };
    };

    expect(res.data.eventId).toBe(target.eventId);
    expect(count()).toBe(before - 1);
    expect(() => call('post', '/me/events/none/read')).toThrow('EVENT_NOT_FOUND');
  });

  it('모두 읽음은 through 뒤에 온 알림을 남긴다', () => {
    const { call, mock } = setup();
    const through = (call('get', '/me/notifications') as Page).data[0].createdAt;
    mock.controls.push('AI_PROPOSAL_READY');
    // 새 알림이 같은 밀리초에 만들어지지 않게 시각을 뒤로 민다
    mock.controls.peek()[0].createdAt = new Date(Date.now() + 1000).toISOString();
    call('post', '/me/notifications/read-all', {}, { through });
    const unread = (call('get', '/me/notifications', { unreadOnly: 'true' }) as Page).data;
    expect(unread).toHaveLength(1);
  });

  it('failNext는 다음 목록 하나만 실패시킨다', () => {
    const { call, mock } = setup();
    mock.controls.failNext();
    expect(() => call('get', '/me/notifications')).toThrow('SERVICE_UNAVAILABLE');
    expect((call('get', '/me/notifications') as Page).data).toHaveLength(9);
  });
});
