import { StyleSheet, Text, View } from 'react-native';

import { Popup } from '@/components/ui/popup';

import { Button } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

type Props = {
  /** 마지막으로 코스를 고친 동행을 부르는 말. "세은님" 또는 "다른 동행". null이면 닫힌다 */
  editor: string | null;
  /** 덮어 저장하는 중 */
  busy: boolean;
  /** 내가 고친 날만 내 것으로 덮어 저장한다(Q-8-4) */
  onOverwrite(): void;
  /** 내 변경을 버리고 최신 코스로 채운다 */
  onLatest(): void;
};

/**
 * 같은 날을 동행과 함께 고쳐 자동으로 합칠 수 없을 때 묻는 상자(Figma 201-13453).
 * 저장이 409로 거절됐거나 연결이 끊겼다 돌아와 바뀐 코스를 알았을 때 뜬다.
 * 닫기 버튼이 없다. 둘 중 하나를 골라야 한다.
 */
const noop = () => undefined;

export function CoeditConflict({ editor, busy, onOverwrite, onLatest }: Props) {
  // 부르는 말은 늘 받침으로 끝나 '이'를 붙인다
  const title = `${editor ?? ''}이 먼저 코스를 바꿨어요`;
  return (
    <Popup
      testID="coedit-conflict"
      visible={editor !== null}
      backdropStyle={styles.dim}
      cardStyle={styles.box}
      accessibilityRole="alert"
      // 안드로이드 뒤로 가기로 묻지 않고 내 변경을 버리지 않게, 둘 중 하나를 누를 때까지 닫지 않는다
      onRequestClose={noop}
    >
      <Text style={[typography.title2, styles.title]}>{title}</Text>
      <Text style={[typography.body, styles.body]}>
        {'같은 곳을 고쳤어요.\n최신 코스를 확인해 주세요'}
      </Text>
      <View style={styles.actions}>
        <PressableScale
          style={styles.overwrite}
          onPress={onOverwrite}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
        >
          <Text style={[typography.bodyMedium, styles.overwriteText]}>내 것으로 덮기</Text>
        </PressableScale>
        <Button
          label="최신 코스 보기"
          weight="medium"
          onPress={onLatest}
          disabled={busy}
          style={styles.latest}
        />
      </View>
    </Popup>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPaddingX,
  },
  box: {
    width: '100%',
    maxWidth: 320,
    paddingTop: spacing[24],
    paddingBottom: spacing[20],
    paddingHorizontal: spacing[24],
    gap: spacing[12],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.white,
    boxShadow: `0 16px 32px ${colors.shadow}`,
  },
  title: { color: colors.text.default },
  body: { color: colors.text.icon },
  actions: { flexDirection: 'row', gap: spacing[10], paddingTop: spacing[8] },
  overwrite: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[12],
  },
  overwriteText: { color: colors.text.icon },
  latest: { flex: 1 },
});
