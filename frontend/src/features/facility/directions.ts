import { Linking, Platform } from 'react-native';

type Destination = { name: string; latitude: number; longitude: number };

/**
 * 길찾기를 열 주소를 먼저 시도할 순서대로 준다.
 * 1) 네이버 지도 앱(도보 길찾기) 2) 기기 기본 지도 앱 3) 웹 지도.
 * 앱이 없으면 열기가 실패하므로 다음 주소로 넘어간다
 */
export function directionsUrls(to: Destination, os: string = Platform.OS): string[] {
  const { latitude, longitude } = to;
  const name = encodeURIComponent(to.name);
  const web = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`;
  if (os === 'web') return [web];
  const naver = `nmap://route/walk?dlat=${latitude}&dlng=${longitude}&dname=${name}&appname=com.eodilog.app`;
  const device =
    os === 'ios'
      ? `http://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=w`
      : `geo:0,0?q=${latitude},${longitude}(${name})`;
  return [naver, device, web];
}

/** S28 길찾기. 열 수 있는 지도 앱이 하나도 없으면 false */
export async function openDirections(to: Destination): Promise<boolean> {
  for (const url of directionsUrls(to)) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // 그 앱이 없다. 다음 주소를 시도한다
    }
  }
  return false;
}
