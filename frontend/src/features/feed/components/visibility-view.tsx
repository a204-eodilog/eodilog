import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { FadeIn } from '@/components/ui/fade-in';
import { Avatar, Button, ErrorState, Header, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { ViewerRow } from '../visibility';

export type VisibilityViewProps = {
  state: 'loading' | 'error' | 'ready';
  tripTitle: string | null;
  rows: readonly ViewerRow[];
  changed: boolean;
  saving: boolean;
  onToggle: (userId: string) => void;
  onSave: () => void;
  onRetry: () => void;
};

/**
 * S39 내 노출 설정(WD-FR-28). 공동 피드는 기본 전체 공개이고, 내 프로필·피드 경로에서만 특정 친구에게 숨긴다.
 * 동행은 숨길 수 없다. 숨겨도 다른 동행의 피드 경로에서는 보일 수 있다
 */
export function VisibilityView(props: VisibilityViewProps) {
  const hidden = props.rows.filter((r) => r.hidden);
  const shown = props.rows.filter((r) => !r.hidden);
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header
        close
        title="내 노출 설정"
        subtitle={props.tripTitle ?? undefined}
        subtitleIcon={props.tripTitle ? 'trip' : undefined}
      />
      {props.state === 'error' ? (
        <ErrorState title="노출 설정을 불러오지 못했어요" onRetry={props.onRetry} />
      ) : props.state === 'loading' ? (
        <SkeletonList style={styles.flex} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Stagger itemStyle={styles.staggerItem}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>내 프로필·피드에서 숨길 친구</Text>
                <Text style={styles.count}>{hidden.length}명 숨김</Text>
              </View>

              {hidden.length > 0 ? (
                <Section label="숨긴 친구" count={hidden.length} tone="danger">
                  {hidden.map((r, order) => (
                    <FadeIn key={r.user.id} index={order}>
                      <Row row={r} onToggle={props.onToggle} />
                    </FadeIn>
                  ))}
                </Section>
              ) : null}

              <Section label="보여 주는 친구" count={shown.length} tone="brand">
                {shown.length === 0 ? (
                  <Text style={styles.empty}>나를 팔로우하는 친구가 아직 없어요</Text>
                ) : (
                  shown.map((r) => <Row key={r.user.id} row={r} onToggle={props.onToggle} />)
                )}
              </Section>

              <View style={styles.note}>
                <Icon name="lock" size={14} color={colors.text.icon} />
                <Text style={styles.noteText}>숨겨도 다른 동행 피드에서는 보일 수 있어요</Text>
              </View>
            </Stagger>
          </ScrollView>
          <View style={styles.saveWrap} pointerEvents="box-none">
            <Button
              label="저장"
              icon="check"
              onPress={props.onSave}
              disabled={!props.changed || props.saving}
              loading={props.saving}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Section({
  label,
  count,
  tone,
  children,
}: {
  label: string;
  count: number;
  tone: 'danger' | 'brand';
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>
        {label}{' '}
        <Text style={tone === 'danger' ? styles.countDanger : styles.countBrand}>{count}</Text>
      </Text>
      <View>{children}</View>
    </View>
  );
}

function Row({ row, onToggle }: { row: ViewerRow; onToggle: (id: string) => void }) {
  const name = row.user.nickname;
  return (
    <View style={styles.row}>
      <Avatar name={name} imageUrl={row.user.profileImageUrl} size="lg" />
      <View style={styles.rowText}>
        <Text style={[styles.name, row.hidden && styles.nameHidden]} numberOfLines={1}>
          {name}
        </Text>
        {row.companion ? <Text style={styles.rowSub}>이 여행 동행 · 항상 보여요</Text> : null}
      </View>
      {row.companion ? (
        <Text style={styles.companion}>동행</Text>
      ) : (
        <PressableScale
          onPress={() => onToggle(row.user.id)}
          style={({ pressed }) => [
            styles.toggle,
            row.hidden ? styles.toggleShow : styles.toggleHide,
            pressed && styles.pressed,
          ]}
          // 보이는 높이는 32, 누르는 자리는 위아래 6씩 넓혀 44
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${name} ${row.hidden ? '다시 보이기' : '숨기기'}`}
        >
          <Icon
            name={row.hidden ? 'eye' : 'eye-off'}
            size={18}
            color={row.hidden ? colors.brand.primaryDark : colors.text.strong}
          />
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[20] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[8],
    paddingBottom: spacing[24],
    gap: spacing[20],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.title3, color: colors.text.default, flexShrink: 1 },
  count: { ...typography.caption, color: colors.text.strong },
  section: { gap: spacing[4] },
  sectionLabel: { ...typography.captionBold, color: colors.text.sub },
  countDanger: { color: colors.status.danger },
  countBrand: { color: colors.brand.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingVertical: spacing[12],
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.bodyMedium, color: colors.text.default },
  nameHidden: { color: colors.text.muted },
  rowSub: { ...typography.caption, color: colors.text.muted },
  companion: { ...typography.caption, color: colors.text.muted, paddingHorizontal: spacing[14] },
  toggle: {
    height: 32,
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
    justifyContent: 'center',
  },
  toggleHide: { backgroundColor: colors.surface.default },
  toggleShow: { backgroundColor: colors.brand.primaryBg },
  empty: { ...typography.caption, color: colors.text.muted, paddingVertical: spacing[12] },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  noteText: { ...typography.caption, color: colors.text.sub },
  // 안전 영역 안에서 배치해 안드로이드 탐색 버튼에 저장 버튼이 가리지 않게 한다.
  saveWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing[24],
  },
});
