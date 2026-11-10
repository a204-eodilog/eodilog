import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { CoeditorStrip, coeditorLabel } from './coeditor-strip';

// 얼굴 부품이 사진 주소를 만들려고 세션과 환경 변수를 불러온다. 테스트에는 .env가 없다
jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

// 공통 부품 입구는 아래 시트 라이브러리까지 불러 테스트에서 쓰는 두 개만 꺼낸다
jest.mock('@/components/ui', () => ({
  Avatar:
    jest.requireActual<typeof import('@/components/ui/avatar')>('@/components/ui/avatar').Avatar,
  Icon: jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon').Icon,
}));

const seeun = { name: '세은', imageUrl: null };
const seung = { name: '승기', imageUrl: null };

describe('coeditorLabel', () => {
  it('한 명이면 이름, 여럿이면 외 N명', () => {
    expect(coeditorLabel([seeun])).toBe('세은님도 이 코스를 고치고 있어요');
    expect(coeditorLabel([seeun, seung])).toBe('세은님 외 1명도 이 코스를 고치고 있어요');
    expect(coeditorLabel([])).toBe('');
  });
});

describe('CoeditorStrip', () => {
  it('편집 중인 동행이 있으면 줄을 보인다', async () => {
    await render(<CoeditorStrip editors={[seeun]} />);
    expect(screen.getByText('세은님도 이 코스를 고치고 있어요')).toBeTruthy();
  });

  it('없으면 아무것도 그리지 않는다', async () => {
    await render(<CoeditorStrip editors={[]} />);
    expect(screen.toJSON()).toBeNull();
  });
});
