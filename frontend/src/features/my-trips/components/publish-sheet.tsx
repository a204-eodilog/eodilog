import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Card, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

type PublishSheetProps = {
  visible: boolean;
  tripTitle: string;
  /** 나를 포함한 참여 중인 동행 수 */
  memberCount: number;
  publishing?: boolean;
  onClose: () => void;
  /** [친구에게 보이는 모습 미리 보기] → S40 */
  onPreview: () => void;
  onPublish: () => void;
};

/**
 * S38 게시 확인 시트. 공동 피드는 동행 모두의 기록이 모두에게 공개된다고 먼저 알린다(결정 Q-3).
 * 숨길 친구는 게시한 뒤 내 노출 설정(S39)에서 고른다
 */
export function PublishSheet({
  visible,
  tripTitle,
  memberCount,
  publishing = false,
  onClose,
  onPreview,
  onPublish,
}: PublishSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} locked={publishing}>
      <View style={styles.titleRow}>
        <View style={styles.titles}>
          <Text style={[typography.title1, styles.text]}>공동 피드를 게시할까요?</Text>
          <View style={styles.tripLine}>
            <Icon name="trip" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
              {`${tripTitle} · 동행 ${memberCount}명의 기록`}
            </Text>
          </View>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={8}
          disabled={publishing}
          onPress={onClose}
          style={styles.close}
        >
          <Icon name="close" color={colors.text.default} />
        </PressableScale>
      </View>

      <View style={styles.body}>
        <Card rounded="xxl" style={styles.guide}>
          <View style={styles.globe}>
            <Icon name="globe" size={20} color={colors.brand.primary} />
          </View>
          {/* 피그마는 16/24·12/18로 그렸다. 값 문서 주석대로 bodyBold·caption 토큰으로 맞춘다 */}
          <View style={styles.guideTexts}>
            <Text style={[typography.bodyBold, styles.text]}>모두에게 공개돼요</Text>
            <Text style={[typography.caption, styles.guideSub]}>
              사진·코스·평가·경비가 함께 올라가요
            </Text>
            <Text style={[typography.caption, styles.guideSub]}>
              숨길 친구는 게시 후 고를 수 있어요
            </Text>
          </View>
        </Card>
        <PressableScale
          accessibilityRole="link"
          hitSlop={8}
          onPress={onPreview}
          style={styles.previewLink}
        >
          <Text style={[typography.captionMedium, styles.link]}>
            친구에게 보이는 모습 미리 보기
          </Text>
        </PressableScale>
      </View>

      <Button label="게시" block loading={publishing} onPress={onPublish} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[8] },
  titles: { flex: 1, gap: spacing[2] },
  tripLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  close: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing[12],
    marginTop: -spacing[6],
  },
  body: { paddingTop: spacing[16], paddingBottom: spacing[20], gap: spacing[12] },
  guide: { flexDirection: 'row', alignItems: 'center', padding: spacing[18], gap: spacing[16] },
  globe: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTexts: { flex: 1 },
  guideSub: { color: colors.text.sub },
  previewLink: { alignSelf: 'flex-start' },
  link: { color: colors.brand.primary },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon, flexShrink: 1 },
});
