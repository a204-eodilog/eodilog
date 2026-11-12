import { StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { Button, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

type Props = {
  onSuggest(): void;
  /** 제안을 받는 중이면 [제안 받기]가 돌아가는 표시와 '제안 받는 중…'으로 바뀌고 눌리지 않는다 */
  suggesting: boolean;
  onAddDirect(): void;
};

/** S27 항목 없음(Figma 201-15518). 가방 그림, 안내, [제안 받기], [직접 추가] */
export function ChecklistEmpty({ onSuggest, suggesting, onAddDirect }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        {/* 가방 아이콘이 없어 여행 가방 아이콘을 쓴다 */}
        <Icon name="trip" size={32} color={colors.text.icon} />
      </View>
      <Text style={[typography.title1, styles.title]}>준비물이 없어요</Text>
      <Text style={[typography.body, styles.body]}>날씨·일정 기준 준비물</Text>
      <View style={styles.actions}>
        {/* 아래 다시 제안 받기 버튼과 같이 받는 동안에도 글자를 남긴다(Button loading은 글자를 숨긴다) */}
        <Button
          label={suggesting ? '제안 받는 중…' : '제안 받기'}
          size="lg"
          weight="medium"
          leading={
            suggesting ? (
              <Spinner size="small" color={colors.text.inverse} />
            ) : (
              <Icon name="bulb" size={20} color={colors.text.inverse} />
            )
          }
          onPress={onSuggest}
          disabled={suggesting}
          style={styles.suggest}
        />
        {/* 공통 Button의 글자 버튼은 파랑이라 디자인의 회색 글자 버튼을 따로 그린다 */}
        <PressableScale style={styles.direct} onPress={onAddDirect} accessibilityRole="button">
          <Icon name="plus" size={20} color={colors.text.icon} />
          <Text style={[typography.bodyMedium, styles.directText]}>직접 추가</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: spacing[20] },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text.default, marginTop: spacing[20], textAlign: 'center' },
  body: { color: colors.text.icon, marginTop: spacing[8], textAlign: 'center' },
  actions: { alignItems: 'center', gap: spacing[10], marginTop: spacing[24] },
  suggest: { alignSelf: 'center' },
  direct: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    minHeight: layout.minTouchTarget + spacing[4],
    paddingHorizontal: spacing[16],
  },
  directText: { color: colors.text.icon },
});
