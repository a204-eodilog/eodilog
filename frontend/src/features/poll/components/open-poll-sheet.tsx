import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { BottomSheet, Button, Chip, Icon } from '@/components/ui';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { colors, spacing, typography } from '@/theme';

import { buildCandidateOptions, regionCounts, withExtraRegions } from '../candidate-options';
import { useRegionNameMap } from '../hooks/use-candidate-names';
import { openPollErrorText, useOpenPoll } from '../hooks/use-open-poll';
import { useSavedPlaces } from '../hooks/use-saved-places';
import { defaultClosesAt, MAX_CANDIDATES } from '../poll-rules';
import type { CandidateOption, Poll, PollType } from '../types';
import { ClosesAtPicker } from './closes-at-picker';
import { OptionRow } from './option-row';
import { SheetHeader } from './sheet-header';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  /** 투표를 연 뒤. 시트는 닫히고 화면이 그 투표로 바뀐다 */
  onOpened: (poll: Poll) => void;
  /** 처음 고를 유형. 그룹 즐겨찾기 화면이 고른 후보를 넘길 때 함께 정한다 */
  initialType?: PollType;
  /** 미리 고른 후보 키(지역·장소 ID) */
  initialSelected?: string[];
  /** 그룹 즐겨찾기에 없어도 지역 후보로 보일 곳. 추천 결과의 여행지를 투표 후보로 넘길 때 쓴다 */
  extraRegions?: { id: string; name: string }[];
  /** 시트를 여는 버튼이 화면에 보이는가. 보이면 후보 목록을 미리 받아 시트가 올라올 때 목록이 같이 보인다 */
  prefetch?: boolean;
  /** 미리보기에서 후보 목록을 그대로 넣는다. 없으면 그룹 즐겨찾기를 받는다 */
  previewOptions?: CandidateOption[];
  now?: Date;
};

/**
 * N8 투표 열기 시트(Figma 385-560). 후보 체크, 유형, 마감 시각, 자동 확정 안내, [투표 열기].
 * 디자인은 S20 위에서 장소 투표만 그렸다. S20이 생기기 전에는 이 시트 안에서 후보를 고르고,
 * 맨 위 지역·장소 칩으로 유형을 고른다 (가정 — 사용자 확인 필요, Q-4-1, Q-4-5)
 */
export function OpenPollSheet({
  visible,
  onClose,
  tripId,
  onOpened,
  initialType = 'REGION',
  initialSelected = [],
  extraRegions,
  prefetch = false,
  previewOptions,
  now,
}: Props) {
  const [type, setType] = useState<PollType>(initialType);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [closesAt, setClosesAt] = useState(() => defaultClosesAt(now ?? new Date()));
  const [limitHit, setLimitHit] = useState(false);
  const saved = useSavedPlaces(tripId, (visible || prefetch) && !previewOptions);
  const regionNames = useRegionNameMap(regionCounts(saved.data ?? []).map((r) => r.regionId));
  const open = useOpenPoll(tripId);
  const trip = useTrip(tripId);
  const memberNames = useMemo(
    () => Object.fromEntries((trip.data?.members ?? []).map((m) => [m.id, m.user.nickname])),
    [trip.data?.members],
  );
  // isPending은 다시 그린 뒤에 바뀌어서, 그 전에 한 번 더 누르면 요청이 두 번 나간다. 누르는 즉시 막는다
  const submitting = useRef(false);

  // 시트를 다시 열면 처음 값으로 돌린다. effect 대신 그리는 중에 맞춘다(React 문서 '이전 값과 비교')
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setType(initialType);
      setSelected(initialSelected);
      setClosesAt(defaultClosesAt(now ?? new Date()));
      setLimitHit(false);
    }
  }

  const close = () => {
    open.reset();
    onClose();
  };

  const options = useMemo(() => {
    if (previewOptions) return previewOptions;
    const built = buildCandidateOptions(type, saved.data ?? [], [], regionNames, memberNames);
    return type === 'REGION' ? withExtraRegions(built, extraRegions ?? []) : built;
  }, [previewOptions, type, saved.data, regionNames, memberNames, extraRegions]);

  const changeType = (next: PollType) => {
    if (next === type) return;
    setType(next);
    setSelected([]);
    setLimitHit(false);
  };

  const toggle = (key: string) => {
    if (selected.includes(key)) {
      setSelected(selected.filter((k) => k !== key));
      setLimitHit(false);
      return;
    }
    if (selected.length >= MAX_CANDIDATES) {
      setLimitHit(true);
      return;
    }
    setSelected([...selected, key]);
  };

  const submit = () => {
    if (submitting.current) return;
    submitting.current = true;
    const candidates = options.filter((o) => selected.includes(o.key)).map((o) => o.input);
    open.mutate(
      { type, candidates, closesAt },
      {
        onSuccess: (poll) => {
          onOpened(poll);
          close();
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };

  const loading = !previewOptions && saved.isPending;
  const title = type === 'REGION' ? '지역 투표 열기' : '장소 투표 열기';

  return (
    <BottomSheet visible={visible} onClose={close} locked={open.isPending}>
      <SheetHeader
        title={title}
        subtitle={`후보 ${selected.length}곳 · 여러 곳을 고를 수 있어요`}
        onClose={close}
        closeDisabled={open.isPending}
      />

      <View style={styles.chips}>
        <Chip label="지역" selected={type === 'REGION'} onPress={() => changeType('REGION')} />
        <Chip label="장소" selected={type === 'PLACE'} onPress={() => changeType('PLACE')} />
      </View>

      {loading ? (
        <Spinner style={styles.loading} color={colors.brand.primary} />
      ) : saved.isError && !previewOptions ? (
        <View style={styles.failed}>
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLabel="그룹 즐겨찾기를 불러오지 못했어요"
          >
            <Icon name="alert" size={24} color={colors.text.icon} />
          </View>
          <Button
            label="다시 시도"
            variant="secondary"
            size="sm"
            onPress={() => void saved.refetch()}
          />
        </View>
      ) : options.length === 0 ? (
        <Text style={styles.notice}>그룹 즐겨찾기에 장소가 없어요</Text>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
        >
          {options.map((o) => (
            <OptionRow
              key={o.key}
              option={o}
              checked={selected.includes(o.key)}
              onToggle={() => toggle(o.key)}
            />
          ))}
        </ScrollView>
      )}
      {limitHit ? (
        <Text style={styles.error}>후보는 {MAX_CANDIDATES}곳까지 고를 수 있어요</Text>
      ) : null}

      <View style={styles.card}>
        <ClosesAtPicker value={closesAt} onChange={setClosesAt} now={now} />
      </View>
      {open.error ? <Text style={styles.error}>{openPollErrorText(open.error)}</Text> : null}

      <Button
        label="투표 열기"
        block
        size="lg"
        weight="medium"
        loading={open.isPending}
        disabled={selected.length === 0 || open.isPending}
        onPress={submit}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // 피그마: 제목 아래 지도 핀 16 + 12 글자, 사이 4
  chips: { flexDirection: 'row', gap: spacing[8], paddingTop: spacing[16] },
  loading: { paddingVertical: spacing[24] },
  notice: {
    ...typography.sub,
    color: colors.text.sub,
    textAlign: 'center',
    paddingVertical: spacing[24],
  },
  failed: { alignItems: 'center', gap: spacing[12], paddingVertical: spacing[24] },
  // 후보가 많으면 시트가 화면을 넘지 않게 목록만 스크롤한다
  list: { maxHeight: 280, marginTop: spacing[16] },
  listContent: { gap: spacing[16] },
  error: { ...typography.caption, color: colors.status.danger, paddingTop: spacing[8] },
  // 피그마: 마감 카드 위 16, 아래 20
  card: { paddingTop: spacing[16], paddingBottom: spacing[20] },
});
