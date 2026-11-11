import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { motion } from '@/theme/motion';

/** 공통 아이콘의 check와 같은 선(24 칸 기준) */
const CHECK_PATH = 'M5 12.5L9.5 17L19 7';
/** 그 선의 길이보다 조금 긴 값. 선을 이만큼 밀어 두었다가 0으로 당기며 그린다 */
const CHECK_LENGTH = 21;

export type CheckMarkProps = {
  size?: number;
  color?: string;
  /** 그리는 움직임 없이 바로 보인다. 처음부터 체크돼 있던 항목에 쓴다 */
  still?: boolean;
};

/**
 * 그려지는 체크 표시. 나타날 때 선이 처음부터 끝까지 220ms 동안 그려진다(theme/motion).
 * 체크 상자, 투표 고르기, 즐겨찾기 담기처럼 "방금 골랐다"를 알려 주는 자리에 Icon name="check" 대신 쓴다.
 * 고르지 않은 상태에서는 그리지 않는다(부르는 쪽이 checked일 때만 그린다).
 * "동작 줄이기"가 켜져 있으면 바로 보인다
 */
export function CheckMark({
  size = 14,
  color = colors.text.inverse,
  still = false,
}: CheckMarkProps) {
  const skip = still || isReduceMotion();
  const offset = useState(() => new Animated.Value(skip ? 0 : CHECK_LENGTH))[0];
  // 선을 얼마나 감췄는지. 움직이는 값을 선에 바로 물리면(Animated 부품) 웹에서 선에 모르는 속성이 붙어
  // 개발 화면에 경고 띠가 뜬다. 그래서 값이 바뀔 때마다 숫자로 받아 넘긴다. 220ms라 열몇 번 그린다
  const [dash, setDash] = useState(skip ? 0 : CHECK_LENGTH);

  useEffect(() => {
    if (skip) return;
    const listening = offset.addListener(({ value }) => setDash(value));
    const drawing = Animated.timing(offset, {
      toValue: 0,
      duration: motion.check.duration,
      easing: motion.easing.inOut,
      // 선 길이는 화면 그리는 쪽에서 돌릴 수 없는 속성이다
      useNativeDriver: false,
    });
    drawing.start();
    return () => {
      drawing.stop();
      offset.removeListener(listening);
    };
  }, [offset, skip]);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={CHECK_PATH}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={CHECK_LENGTH}
        strokeDashoffset={skip ? 0 : dash}
      />
    </Svg>
  );
}

export type CheckMarkWhenProps = Omit<CheckMarkProps, 'still'> & { checked: boolean };

/**
 * checked일 때만 체크를 그린다. 화면을 열 때 이미 체크돼 있던 것은 움직이지 않고, 방금 체크한 것만 선이 그려진다.
 * 목록을 열 때 체크된 줄이 한꺼번에 그려지면 어수선하다
 */
export function CheckMarkWhen({ checked, ...rest }: CheckMarkWhenProps) {
  // 처음부터 체크돼 있었으면 가만히 둔다. 한 번이라도 풀리면 그다음부터는 그린다
  const [still, setStill] = useState(checked);
  if (!checked && still) setStill(false);
  // 방금 체크했을 때만 선택 진동. 화면을 열 때 이미 체크돼 있던 것은 울리지 않는다
  useEffect(() => {
    if (checked && !still) haptic.select();
  }, [checked, still]);
  return checked ? <CheckMark {...rest} still={still} /> : null;
}
