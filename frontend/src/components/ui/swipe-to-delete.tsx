import { useRef, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { haptic } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

import { Icon } from './icon';

type SwipeToDeleteProps = {
  children: ReactNode;
  /** 지우기. 실패하면 false를 돌려주고, 그러면 줄이 제자리로 돌아온다 */
  onDelete: () => Promise<boolean> | boolean;
  /** 화면 읽어 주기에 보이는 동작 이름. "알림 지우기" */
  label: string;
};

/**
 * 줄을 왼쪽으로 밀어 지운다. 밀면 뒤에 빨간 휴지통 바탕이 드러나고, 절반 넘게 밀고 놓으면 끝까지 밀려 나가며 지워진다.
 * 덜 밀고 놓으면 제자리로 돌아온다. 밀기를 못 쓰는 사람은 화면 읽어 주기의 동작으로 지운다
 */
export function SwipeToDelete({ children, onDelete, label }: SwipeToDeleteProps) {
  const { width } = useWindowDimensions();
  const ref = useRef<SwipeableMethods>(null);
  const remove = async () => {
    haptic.light();
    const done = await onDelete();
    if (!done) ref.current?.close();
  };
  return (
    <View
      accessibilityActions={[{ name: 'delete', label }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'delete') void remove();
      }}
    >
      <Swipeable
        ref={ref}
        friction={1.2}
        rightThreshold={width * 0.3}
        overshootRight={false}
        renderRightActions={() => (
          <View style={[styles.behind, { width }]}>
            <Icon name="trash" size={22} color={colors.text.inverse} />
          </View>
        )}
        onSwipeableOpen={() => void remove()}
      >
        {/* 줄 바탕이 투명하면 뒤의 빨간 바탕이 밀기 전에도 비쳐 보인다. 화면 바탕색으로 덮는다 */}
        <View style={styles.front}>{children}</View>
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 모서리를 둥글리지 않는다. 둥글리면 모서리 틈으로 뒤의 빨간 바탕이 비친다
  front: { backgroundColor: colors.surface.white },
  // 줄 뒤에 깔리는 빨간 바탕. 휴지통은 줄이 밀려난 왼쪽 끝에서부터 보인다
  behind: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: spacing[24],
    borderRadius: radius.xl,
    backgroundColor: colors.status.dangerMid,
  },
});
