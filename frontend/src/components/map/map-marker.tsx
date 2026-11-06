import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

import { colors } from '@/theme';

import type { LatLng } from './korea';
import type { MapPillProps } from './map-pill';

export type MapMarkerProps = LatLng &
  MapPillProps & {
    /** 접근성·식별용. "강릉, 친구 3명이 다녀갔어요" */
    accessibilityLabel?: string;
    onPress?: () => void;
    /** 겹칠 때 위에 그릴 순서. 강조한 마커를 위로 올릴 때 */
    zIndex?: number;
  };

const IMAGES = {
  numberBrand: require('./assets/number-brand.png'),
  numberDark: require('./assets/number-dark.png'),
  dotBrand: require('./assets/dot-brand.png'),
  dotDark: require('./assets/dot-dark.png'),
} as const;

/** 번호 동그라미(26)·점(14) 크기. assets의 그림과 같다 */
const NUMBER_SIZE = 26;
const DOT_SIZE = 14;

/** 이름 대신 번호만 있는 핀(S07 경로·S28 시설). 동그라미 안에 번호를 쓴다 */
const isNumber = (label?: string) => !!label && /^\d{1,3}$/.test(label);

/**
 * 지도 위 마커. 네이버 지도 SDK의 그림(동그라미·점) + 글자(캡션)로 그린다.
 * 번호만 있으면 파란 동그라미 안에 번호, 이름이 있으면 점 위에 이름(+ 개수·이니셜은 아래 작은 글자).
 *
 * 라이브러리(2.9.1)의 "Custom React View" 마커는 새 구조(Fabric) 안드로이드에서 그림으로 바뀌지 않고
 * 지도 왼쪽에 일반 화면처럼 쌓여서(11/06 폰 확인) 쓰지 않는다. 웹 미리보기는 map-marker.web.tsx(말풍선 모양)
 */
export function MapMarker({
  latitude,
  longitude,
  onPress,
  zIndex,
  label,
  initials,
  count,
  highlighted = false,
  dot = 'dark',
}: MapMarkerProps) {
  // 좌표가 숫자가 아니면 네이버 지도가 오류 화면을 띄우므로 그 핀만 그리지 않는다
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const number = isNumber(label);
  const brand = dot === 'brand' || number;
  const image = number
    ? highlighted
      ? IMAGES.numberDark
      : IMAGES.numberBrand
    : brand
      ? IMAGES.dotBrand
      : IMAGES.dotDark;
  const size = number ? NUMBER_SIZE : DOT_SIZE;
  const extra = [initials?.join(' '), count !== undefined ? String(count) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      image={image}
      width={size}
      height={size}
      anchor={{ x: 0.5, y: 0.5 }}
      onTap={onPress}
      zIndex={zIndex}
      caption={
        label
          ? number
            ? { text: label, align: 'Center', color: colors.text.inverse, textSize: 11 }
            : {
                text: label,
                align: 'Top',
                offset: 2,
                textSize: 13,
                color: highlighted ? colors.brand.primaryDark : colors.text.default,
                haloColor: colors.surface.white,
              }
          : undefined
      }
      subCaption={
        !number && extra
          ? {
              text: extra,
              color: colors.brand.primary,
              haloColor: colors.surface.white,
              textSize: 11,
            }
          : undefined
      }
    />
  );
}
