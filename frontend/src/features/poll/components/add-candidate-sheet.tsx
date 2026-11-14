import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { BottomSheet, Button } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { CheckMarkWhen } from '@/components/ui/check-mark';
import { colors, fontFamily, layout, radius, spacing, typography } from '@/theme';

import { buildCandidateOptions, regionCounts } from '../candidate-options';
import { useRegionNameMap } from '../hooks/use-candidate-names';
import { useSavedPlaces } from '../hooks/use-saved-places';
import { MAX_CANDIDATES } from '../poll-rules';
import type { CandidateInput, CandidateOption, Poll } from '../types';
import { SheetHeader } from './sheet-header';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  poll: Poll;
  /** 고른 후보를 넣는다. 끝나면 시트를 닫는다 */
  onSubmit: (inputs: CandidateInput[]) => Promise<unknown>;
  busy: boolean;
  /** 시트를 여는 버튼이 화면에 보이는가. 보이면 후보 목록을 미리 받는다 */
  prefetch?: boolean;
  /** 미리보기에서 후보 목록을 그대로 넣는다 */
  previewOptions?: CandidateOption[];
};

/**
 * S22 후보 추가 시트(Figma 418-188). 아직 후보가 아닌 그룹 즐겨찾기 지역·장소를 골라 넣는다.
 * 회색 카드 안 네모 체크 줄, "넣으면 투표 중인 동행에게 알려요", [후보에 넣기]
 */
export function AddCandidateSheet({
  visible,
  onClose,
  tripId,
  poll,
  onSubmit,
  busy,
  prefetch = false,
  previewOptions,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSelected([]);
  }
  const saved = useSavedPlaces(tripId, (visible || prefetch) && !previewOptions);
  const regionNames = useRegionNameMap(regionCounts(saved.data ?? []).map((r) => r.regionId));
  const options = useMemo(
    () =>
      previewOptions ??
      buildCandidateOptions(poll.type, saved.data ?? [], poll.candidates, regionNames),
    [previewOptions, poll.type, poll.candidates, saved.data, regionNames],
  );
  const room = MAX_CANDIDATES - poll.candidates.length;
  const submitting = useRef(false);

  const toggle = (key: string) => {
    if (selected.includes(key)) setSelected(selected.filter((k) => k !== key));
    else if (selected.length < room) setSelected([...selected, key]);
  };

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await onSubmit(options.filter((o) => selected.includes(o.key)).map((o) => o.input));
    } finally {
      submitting.current = false;
    }
  };

  const typeLabel = poll.type === 'REGION' ? '지역 투표' : '장소 투표';
  const loading = !previewOptions && saved.isPending;

  return (
    <BottomSheet visible={visible} onClose={onClose} locked={busy} scrollable>
      <SheetHeader
        title="후보 추가"
        subtitle={`${typeLabel} · 여러 곳을 골라 넣을 수 있어요`}
        onClose={onClose}
        closeDisabled={busy}
      />
      <View style={styles.card}>
        {loading ? (
          <Spinner color={colors.brand.primary} />
        ) : options.length === 0 ? (
          <Text style={styles.empty}>더 넣을 수 있는 곳이 없어요</Text>
        ) : (
          <ScrollView
            decelerationRate={SCROLL_DECELERATION}
            style={styles.list}
            nestedScrollEnabled
          >
            {options.map((o) => {
              const checked = selected.includes(o.key);
              return (
                <PressableScale
                  key={o.key}
                  accessibilityRole="checkbox"
                  accessibilityLabel={o.title}
                  accessibilityState={{ checked }}
                  aria-checked={checked}
                  onPress={() => toggle(o.key)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={[styles.box, checked && styles.boxOn]}>
                    <CheckMarkWhen checked={checked} size={14} />
                  </View>
                  <View style={styles.texts}>
                    <Text style={[styles.name, checked && styles.nameOn]} numberOfLines={1}>
                      {o.title}
                    </Text>
                    {o.subtitle ? (
                      <Text style={styles.sub} numberOfLines={1}>
                        {o.subtitle}
                      </Text>
                    ) : null}
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>
        )}
        <Text style={styles.note}>넣으면 투표 중인 동행에게 알려요</Text>
      </View>
      <Button
        label="후보에 넣기"
        icon="plus"
        block
        size="lg"
        weight="medium"
        loading={busy}
        disabled={selected.length === 0 || busy}
        onPress={() => void submit()}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // 피그마: 회색 면, 둥글기 24, 안쪽 18, 줄 사이 8, 위 16 아래 20
  card: {
    marginTop: spacing[16],
    marginBottom: spacing[20],
    padding: spacing[18],
    gap: spacing[8],
    borderRadius: radius.xxl,
    backgroundColor: colors.surface.default,
  },
  list: { maxHeight: 260 },
  // 피그마: 위아래 8, 네모와 글자 사이 12
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingVertical: spacing[8],
    minHeight: layout.minTouchTarget,
  },
  pressed: { opacity: 0.6 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  texts: { flex: 1, gap: spacing[2] },
  name: { ...typography.bodySmall, fontFamily: fontFamily.medium, color: colors.text.default },
  nameOn: { fontFamily: fontFamily.bold },
  sub: { ...typography.caption, color: colors.text.icon },
  empty: {
    ...typography.sub,
    color: colors.text.sub,
    textAlign: 'center',
    paddingVertical: spacing[12],
  },
  // 빈 안내와 함께 가운데 둔다(2026-11-14 사용자 요청)
  note: { ...typography.caption, color: colors.text.icon, textAlign: 'center' },
});
