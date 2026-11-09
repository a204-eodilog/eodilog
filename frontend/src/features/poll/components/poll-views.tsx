import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { spacing } from '@/theme';

/**
 * S22 진행 중인 투표 없음(Figma 201-10579). 가운데 아이콘 + 제목 + 설명 두 줄 + [후보 고르러 가기].
 * [후보 고르러 가기]는 S20 대신 N8을 바로 연다 (가정 — 사용자 확인 필요, Q-4-1)
 */
export function PollEmptyView({ onPick }: { onPick: () => void }) {
  return (
    <View style={styles.center}>
      <EmptyState
        icon="check"
        title="진행 중인 투표가 없어요"
        description={'즐겨찾기나 추천에서 후보를 골라요\n마감은 기본 24시간 뒤예요'}
        actionLabel="후보 고르러 가기"
        onAction={onPick}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingBottom: spacing[32] },
});
