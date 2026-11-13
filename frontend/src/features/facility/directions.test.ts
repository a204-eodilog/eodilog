import { describe, expect, it } from '@jest/globals';

import { directionsUrls } from './directions';

const to = { name: '강릉역 충전소', latitude: 37.7637, longitude: 128.8996 };

describe('directionsUrls', () => {
  it('안드로이드는 네이버 지도, 기본 지도, 웹 순서로 시도한다', () => {
    const urls = directionsUrls(to, 'android');
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(
      `nmap://route/walk?dlat=37.7637&dlng=128.8996&dname=${encodeURIComponent('강릉역 충전소')}&appname=com.eodilog.app`,
    );
    expect(urls[1]).toBe(`geo:0,0?q=37.7637,128.8996(${encodeURIComponent('강릉역 충전소')})`);
    expect(urls[2]).toContain('destination=37.7637,128.8996');
  });

  it('아이폰은 기본 지도로 애플 지도를 쓴다', () => {
    expect(directionsUrls(to, 'ios')[1]).toBe(
      'http://maps.apple.com/?daddr=37.7637,128.8996&dirflg=w',
    );
  });

  it('웹은 웹 지도 하나만 연다', () => {
    expect(directionsUrls(to, 'web')).toHaveLength(1);
  });
});
