import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, toast } from '@/components/ui';
import { PlaceSaveSheet } from '@/features/saved';
import { PlaceSaveSheetView } from '@/features/saved/components/place-save-sheet-view';
import { type SaveChoice, toggleSaveChoice } from '@/features/saved/saved-rules';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S08 장소 저장 시트 상태 보기. 서버 없이 값 문서 예시(강문 해변, 연말 강릉·겨울 여행)로 그린다.
 * 앱 흐름에는 안 나오고 /dev/place-save로만 들어온다.
 * [실제 시트]는 서버(또는 개발용 테스트 모드)에 붙은 시트를 연다. 테스트 모드의 강문 해변(place-bookmark-2)으로 저장하고,
 * [없는 장소]는 테스트 모드에 없는 장소라 나만 보기 저장이 실패한다(오류 띠 확인)
 */

const TRIPS = [
  { id: 't1', title: '연말 강릉', period: '12.26 – 12.27', companions: '민준, 지우' },
  { id: 't2', title: '겨울 여행', period: '11.14 – 11.15', companions: '서연, 민준, 지우' },
];

type Example = 'basic' | 'noTrip' | 'failed' | 'imported' | 'tripsError';

const EXAMPLES: { key: Example; label: string }[] = [
  { key: 'basic', label: '기본' },
  { key: 'noTrip', label: '내 여행 없음' },
  { key: 'failed', label: '저장 실패' },
  { key: 'imported', label: '가져온 장소' },
  { key: 'tripsError', label: '내 여행 불러오기 실패' },
];

export default function PlaceSaveStates() {
  const [example, setExample] = useState<Example | null>(null);
  const [choice, setChoice] = useState<SaveChoice>('trip');
  const [tripId, setTripId] = useState<string | null>('t1');
  // 실제 시트: 'ok' 강문 해변(테스트 모드에 있는 장소), 'missing' 테스트 모드에 없는 장소(개인 저장이 404로 실패)
  const [live, setLive] = useState<'ok' | 'missing' | null>(null);

  const open = (e: Example) => {
    setExample(e);
    setChoice(e === 'imported' ? 'personal' : 'trip');
    setTripId('t1');
  };
  const trips = example === 'noTrip' ? [] : TRIPS;
  const close = () => setExample(null);

  return (
    <ScrollView
      decelerationRate={SCROLL_DECELERATION}
      contentContainerStyle={styles.menu}
      style={styles.screen}
    >
      <Text style={typography.title2}>S08 장소 저장 시트</Text>
      <View style={styles.row}>
        {EXAMPLES.map((e) => (
          <Button key={e.key} label={e.label} variant="neutral" onPress={() => open(e.key)} />
        ))}
      </View>
      <View style={styles.row}>
        <Button label="실제 시트 (강문 해변)" onPress={() => setLive('ok')} />
        <Button
          label="실제 시트 (없는 장소)"
          variant="neutral"
          onPress={() => setLive('missing')}
        />
      </View>

      <PlaceSaveSheetView
        visible={example !== null}
        placeNames={example === 'imported' ? ['강문 해변', '안목 커피거리'] : ['강문 해변']}
        choice={choice}
        onToggle={(cell) => setChoice((c) => toggleSaveChoice(c, cell))}
        trips={trips}
        tripsStatus={example === 'tripsError' ? 'error' : 'ready'}
        onRetryTrips={() => setExample('basic')}
        selectedTripId={tripId}
        onSelectTrip={setTripId}
        failed={example === 'failed'}
        onClose={close}
        onSave={() => {
          const trip =
            choice === 'trip' && trips.length > 0 ? trips.find((t) => t.id === tripId) : null;
          close();
          toast.success(trip ? `${trip.title}에 담았어요` : '개인 즐겨찾기에 저장했어요', {
            action: { label: '보기', onPress: () => toast.show('준비 중이에요') },
          });
        }}
      />
      <PlaceSaveSheet
        visible={live !== null}
        places={[
          live === 'missing'
            ? { id: 'place-missing', name: '없는 장소' }
            : { id: 'place-bookmark-2', name: '강문 해변' },
        ]}
        onClose={() => setLive(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
