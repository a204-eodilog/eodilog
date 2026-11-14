import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  isNaverMapLink,
  isNaverShortLink,
  linkToSend,
  naverPlaceId,
  readableNaverLink,
} from './map-link';

const PAGE = 'https://m.place.naver.com/place/11555552/home';

describe('네이버 지도 링크 알아보기', () => {
  it('짧은 링크와 지도 페이지 주소를 구분한다', () => {
    expect(isNaverShortLink('https://naver.me/5abCdEfG')).toBe(true);
    expect(isNaverShortLink('https://blog.naver.com/a/1')).toBe(false);
    expect(isNaverMapLink('https://map.naver.com/p/entry/place/11555552')).toBe(true);
    expect(isNaverMapLink('https://m.place.naver.com/place/11555552/home')).toBe(false);
    expect(isNaverMapLink('글')).toBe(false);
  });

  it('주소에서 가게 번호를 찾는다', () => {
    expect(naverPlaceId('https://map.naver.com/p/entry/place/11555552?c=15.00,0,0,0,dh')).toBe(
      '11555552',
    );
    expect(naverPlaceId('https://map.naver.com/v5/entry/place/11555552')).toBe('11555552');
    expect(naverPlaceId('https://m.place.naver.com/share?id=11555552&tabsPath=%2Fhome')).toBe(
      '11555552',
    );
    expect(naverPlaceId('https://app.map.naver.com/launchApp/?version=11&pinId=11555552')).toBe(
      '11555552',
    );
    expect(naverPlaceId('https://map.naver.com/p/search/족발')).toBeNull();
  });

  it('지도 페이지 주소만 모바일 페이지 주소로 바꾼다', () => {
    expect(readableNaverLink('https://map.naver.com/p/entry/place/11555552')).toBe(PAGE);
    expect(readableNaverLink('https://map.naver.com/p/search/족발')).toBeNull();
    expect(readableNaverLink('https://sns.example.com/place/11555552')).toBeNull();
  });
});

describe('linkToSend', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const fetchTo = (url: string, body = '') => {
    globalThis.fetch = jest.fn(async () => ({ url, text: async () => body })) as never;
  };

  it('다른 사이트 링크는 그대로 보내고 따라가지 않는다', async () => {
    globalThis.fetch = jest.fn() as never;
    expect(await linkToSend('https://sns.example.com/p/1')).toBe('https://sns.example.com/p/1');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('지도 페이지 주소는 따라가지 않고 바로 바꾼다', async () => {
    globalThis.fetch = jest.fn() as never;
    expect(await linkToSend('https://map.naver.com/p/entry/place/11555552')).toBe(PAGE);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('짧은 링크는 따라간 끝 주소의 가게 번호로 바꾼다', async () => {
    fetchTo('https://map.naver.com/p/entry/place/11555552?placePath=%2Fhome');
    expect(await linkToSend('https://naver.me/5abCdEfG')).toBe(PAGE);
  });

  it('끝 주소에 번호가 없으면 받은 페이지 글에서 찾는다', async () => {
    fetchTo('https://naver.me/5abCdEfG', '<a href="https://map.naver.com/p/entry/place/11555552">');
    expect(await linkToSend('https://naver.me/5abCdEfG')).toBe(PAGE);
  });

  it('번호를 못 찾거나 따라가지 못하면 받은 링크를 그대로 보낸다', async () => {
    fetchTo('https://map.naver.com/p/search/족발', '<html></html>');
    expect(await linkToSend('https://naver.me/5abCdEfG')).toBe('https://naver.me/5abCdEfG');
    globalThis.fetch = jest.fn(async () => {
      throw new Error('network');
    }) as never;
    expect(await linkToSend('https://naver.me/5abCdEfG')).toBe('https://naver.me/5abCdEfG');
  });
});
