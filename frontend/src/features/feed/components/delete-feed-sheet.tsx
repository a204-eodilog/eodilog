import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon, RoundCheck } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

export type DeleteFeedChoice = 'feed' | 'record';

export type DeleteFeedSheetProps = {
  visible: boolean;
  tripTitle: string;
  loading?: boolean;
  onClose: () => void;
  /** feed: 공동 피드만 삭제(모든 동행 피드에서 사라짐, 각자 기록은 남음), record: 내 기록까지 */
  onConfirm: (choice: DeleteFeedChoice) => void;
};

const CHOICES: { key: DeleteFeedChoice; title: string; desc: string; danger?: boolean }[] = [
  {
    key: 'feed',
    title: '공동 피드 삭제',
    desc: '모든 동행의 피드에서 사라져요. 각자 기록은 남아요',
  },
  { key: 'record', title: '기록까지 삭제', desc: '내 기록만 지워져요', danger: true },
];

/**
 * S39 "공동 피드 삭제 확인"(결정 Q-3: 동행 누구나 삭제). S38 내 여행 기록 화면이 연다.
 * 기본 선택은 공동 피드만 삭제. 기록까지 삭제는 빨간 글자로 구분한다
 */
export function DeleteFeedSheet(props: DeleteFeedSheetProps) {
  const [choice, setChoice] = useState<DeleteFeedChoice>('feed');
  // 열 때마다 기본 선택(공동 피드만 삭제)으로 돌린다. 이전 열림 상태와 비교해 그리는 중에 바꾼다
  const [wasVisible, setWasVisible] = useState(props.visible);
  if (props.visible !== wasVisible) {
    setWasVisible(props.visible);
    if (props.visible) setChoice('feed');
  }
  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      locked={props.loading}
      title="공동 피드를 삭제할까요?"
      footer={
        <View style={styles.footer}>
          <Button label="취소" variant="text" onPress={props.onClose} disabled={props.loading} />
          <Button
            label="삭제하기"
            onPress={() => props.onConfirm(choice)}
            loading={props.loading}
          />
        </View>
      }
    >
      <View style={styles.trip}>
        <Icon name="trip" size={16} color={colors.text.icon} />
        <Text style={styles.tripText}>{props.tripTitle}</Text>
      </View>
      <View style={styles.choices}>
        {CHOICES.map((c) => {
          const on = choice === c.key;
          return (
            <PressableScale
              key={c.key}
              onPress={() => setChoice(c.key)}
              style={[styles.choice, on && styles.choiceOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <RoundCheck
                checked={on}
                onChange={() => setChoice(c.key)}
                accessibilityLabel={c.title}
              />
              <View style={styles.choiceText}>
                <Text style={[styles.choiceTitle, c.danger && styles.danger]}>{c.title}</Text>
                <Text style={styles.choiceDesc}>{c.desc}</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  trip: { flexDirection: 'row', alignItems: 'center', gap: spacing[6], marginTop: -spacing[8] },
  tripText: { ...typography.caption, color: colors.text.sub },
  choices: { gap: spacing[10], marginTop: spacing[16] },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[18],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  choiceOn: { backgroundColor: colors.brand.primaryBg },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { ...typography.bodyBold, color: colors.text.default },
  danger: { color: colors.status.danger },
  choiceDesc: { ...typography.caption, color: colors.text.sub },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[8],
  },
});
