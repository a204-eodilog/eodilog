import { describe, expect, it } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import { errorLook } from './error-look';

const config = { headers: new AxiosHeaders() };
const answered = (status: number) =>
  new AxiosError('fail', 'ERR', config, null, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config,
  });

describe('errorLook', () => {
  it('서버에 닿지 못한 요청만 연결 끊김', () => {
    expect(errorLook(new AxiosError('Network Error', 'ERR_NETWORK', config))).toEqual({
      icon: 'wifi-off',
      title: '연결이 끊겼어요',
    });
  });

  it('403·404는 볼 수 없음', () => {
    expect(errorLook(answered(404)).icon).toBe('lock');
    expect(errorLook(answered(403)).title).toBe('볼 수 없어요');
  });

  it('서버 오류, 작업 실패, 모르는 오류는 불러오지 못함', () => {
    const fallback = { icon: 'alert', title: '불러오지 못했어요' };
    expect(errorLook(answered(500))).toEqual(fallback);
    expect(errorLook(new Error('job failed'))).toEqual(fallback);
    expect(errorLook(null)).toEqual(fallback);
  });
});
