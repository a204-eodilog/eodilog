import { describe, expect, it } from '@jest/globals';

import {
  ageBandLabel,
  NICKNAME_MAX_LENGTH,
  normalizeNickname,
  photoContentType,
  PROFILE_MAX_BYTES,
  profilePhotoProblem,
  toAgeBand,
} from './profile-rules';

describe('normalizeNickname', () => {
  it('앞뒤 공백을 빼고 돌려준다', () => {
    expect(normalizeNickname('  지우 ')).toBe('지우');
  });

  it('비어 있거나 공백만 있으면 null', () => {
    expect(normalizeNickname('')).toBeNull();
    expect(normalizeNickname('   ')).toBeNull();
  });

  it('50자까지만 받는다', () => {
    expect(normalizeNickname('가'.repeat(NICKNAME_MAX_LENGTH))).toHaveLength(50);
    expect(normalizeNickname('가'.repeat(NICKNAME_MAX_LENGTH + 1))).toBeNull();
  });
});

describe('연령대', () => {
  it('서버 값을 화면 글자로 바꾼다', () => {
    expect(ageBandLabel('TWENTIES')).toBe('20대');
    expect(ageBandLabel('SIXTIES_PLUS')).toBe('60대 이상');
  });

  it('없거나 모르는 값은 null', () => {
    expect(ageBandLabel(null)).toBeNull();
    expect(toAgeBand('20대')).toBeNull();
    expect(toAgeBand('TEENS')).toBe('TEENS');
  });
});

describe('프로필 사진 형식', () => {
  it('선택창이 준 형식을 쓰고, 없으면 확장자로 짐작한다', () => {
    expect(photoContentType('file:///a.heic', 'image/jpeg')).toBe('image/jpeg');
    expect(photoContentType('file:///a.JPG')).toBe('image/jpeg');
    expect(photoContentType('file:///a.png?x=1')).toBe('image/png');
    expect(photoContentType('file:///a.heic')).toBe('image/heic');
  });

  it('JPG·PNG만, 15MB까지 받는다', () => {
    expect(profilePhotoProblem('image/jpeg', 1000)).toBeNull();
    expect(profilePhotoProblem('image/png', PROFILE_MAX_BYTES)).toBeNull();
    expect(profilePhotoProblem('image/heic', 1000)).toBe('JPG·PNG 사진만 넣을 수 있어요');
    expect(profilePhotoProblem('image/jpeg', PROFILE_MAX_BYTES + 1)).toBe(
      '15MB보다 작은 사진을 골라 주세요',
    );
    expect(profilePhotoProblem('image/jpeg', 0)).toBe('사진을 읽지 못했어요');
  });
});
