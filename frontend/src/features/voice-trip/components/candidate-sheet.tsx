import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon, TextField } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

import { getCandidates, VoiceTripError } from '../api';
import { formatDistance, saidLine, type AiPlace, type Candidate } from '../voice-trip-rules';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 제목. "바다 보이는 카페, 다른 곳으로 바꿀까요?" / "1일차에 넣을 곳" */
  title: string;
  /** 사용자가 한 말. 제목 아래에 보인다 */
  said?: string | null;
  initialQuery: string;
  destination: string | null;
  /** 가까운 순으로 보일 기준(그날 앞 장소) */
  near: { latitude: number; longitude: number } | null;
  /** 지금 넣어 둔 곳. 맨 위에 표시한다 */
  current?: AiPlace | null;
  onPick: (place: AiPlace) => void;
};

/** AI가 고른 곳 바꾸기, 손으로 장소 넣기에 쓰는 후보 목록. 검색어를 바꿔 다시 찾을 수 있다 */
export function CandidateSheet(props: Props) {
  const { visible, initialQuery, destination, near } = props;
  const [query, setQuery] = useState(initialQuery);
  const [asked, setAsked] = useState(initialQuery);
  // 어떤 검색어의 결과인지 함께 둔다. 검색어가 바뀌면 결과가 올 때까지 도는 표시가 보인다
  // (열 때마다 부르는 쪽이 새로 그려 처음 검색어로 시작한다)
  const [result, setResult] = useState<{
    for: string;
    list: Candidate[] | null;
    error: string | null;
  } | null>(null);
  const [picked, setPicked] = useState<AiPlace | null>(props.current ?? null);

  useEffect(() => {
    if (!visible || !asked.trim()) return;
    let live = true;
    getCandidates({ query: asked.trim(), destination, near })
      .then((found) => live && setResult({ for: asked, list: found, error: null }))
      .catch(
        (e) =>
          live &&
          setResult({
            for: asked,
            list: null,
            error: e instanceof VoiceTripError ? e.message : '찾지 못했어요',
          }),
      );
    return () => {
      live = false;
    };
  }, [visible, asked, destination, near]);

  const fresh = result?.for === asked ? result : null;
  const list = fresh?.list ?? null;
  const error = fresh?.error ?? null;

  return (
    <BottomSheet
      visible={visible}
      onClose={props.onClose}
      title={props.title}
      titleVariant="title3"
      description={props.said ? saidLine(props.said) : undefined}
      descriptionVariant="caption"
      scrollable
      footer={
        <Button
          label="이곳으로"
          size="lg"
          block
          disabled={!picked}
          onPress={() => picked && props.onPick(picked)}
        />
      }
    >
      <View style={styles.wrap}>
        <TextField
          variant="filled"
          value={query}
          onChangeText={setQuery}
          placeholder="가게 이름이나 종류"
          returnKeyType="search"
          onSubmitEditing={() => setAsked(query)}
          trailing={
            <PressableScale accessibilityLabel="찾기" onPress={() => setAsked(query)}>
              <Icon name="search" size={20} color={colors.text.icon} />
            </PressableScale>
          }
          accessibilityLabel="찾을 곳"
        />
        {near ? <Text style={[typography.caption, styles.note]}>앞 장소에서 가까운 순</Text> : null}
        {error ? <Text style={[typography.caption, styles.error]}>{error}</Text> : null}
        {!list && !error ? <ActivityIndicator color={colors.brand.primary} /> : null}
        {list && list.length === 0 ? (
          <Text style={[typography.caption, styles.note]}>
            찾은 곳이 없어요. 다른 말로 찾아 보세요
          </Text>
        ) : null}
        {list?.map((c) => {
          const on = picked?.providerPlaceId === c.place.providerPlaceId;
          const isCurrent = props.current?.providerPlaceId === c.place.providerPlaceId;
          const meta = [
            isCurrent ? '지금 넣은 곳' : null,
            c.place.address,
            formatDistance(c.distanceMeters),
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <PressableScale
              key={c.place.providerPlaceId}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setPicked(c.place)}
              style={[styles.row, on && styles.rowOn]}
            >
              <View style={styles.rowText}>
                <Text style={[typography.bodyBold, styles.name]}>{c.place.name}</Text>
                <Text style={[typography.caption, styles.meta]} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
              {on ? <Icon name="check" size={20} color={colors.brand.primary} /> : null}
            </PressableScale>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[10], paddingBottom: spacing[8] },
  note: { color: colors.text.sub },
  error: { color: colors.status.danger },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    padding: spacing[14],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.strong,
  },
  rowOn: {
    borderWidth: 2,
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primaryBg,
  },
  rowText: { flex: 1, gap: spacing[2] },
  name: { color: colors.text.default },
  meta: { color: colors.text.sub },
});
