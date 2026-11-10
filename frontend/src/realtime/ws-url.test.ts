import { describe, expect, it } from '@jest/globals';

import { wsUrl } from './ws-url';

describe('실시간 연결 주소', () => {
  it('http는 ws, https는 wss로 바꾸고 /ws를 붙인다', () => {
    expect(wsUrl('http://localhost:8080')).toBe('ws://localhost:8080/ws');
    expect(wsUrl('https://a.b/')).toBe('wss://a.b/ws');
  });
});
