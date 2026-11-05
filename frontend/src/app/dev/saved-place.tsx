import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, toast } from '@/components/ui';
import { AddToTripSheet } from '@/features/saved/components/add-to-trip-sheet';
import { MemoSheet } from '@/features/saved/components/memo-sheet';
import { SavedPlaceView } from '@/features/saved/components/saved-place-view';
import { colors, layout, spacing } from '@/theme';

/**
 * 개발용 S14 상태 보기. 서버 없이 값 문서 예시(강문 해변)로 그린다.
 * 앱 흐름에는 안 나오고 /dev/saved-place로만 들어온다. [뒤로]를 누르면 상태 고르기로 돌아간다
 */

const TRIPS = [
  { id: 't1', title: '겨울 여행', period: '12.26 – 12.27', companions: '민준, 지우' },
  { id: 't2', title: '강릉 바다', period: '11.14 – 11.15', companions: '서연' },
];

type Example = 'basic' | 'lost' | 'add' | 'noTrip' | 'tripsError';

export default function SavedPlaceStates() {
  const [example, setExample] = useState<Example | null>(null);
  const [memo, setMemo] = useState('일출 보러 새벽에 가기');
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoKey, setMemoKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);

  if (!example) {
    const open = (e: Example) => {
      setExample(e);
      setTripId(null);
      setAddOpen(e === 'add' || e === 'noTrip' || e === 'tripsError');
    };
    return (
      <ScrollView contentContainerStyle={styles.menu} style={styles.screen}>
        <View style={styles.row}>
          <Button label="기본" variant="neutral" onPress={() => open('basic')} />
          <Button label="원본 볼 수 없음" variant="neutral" onPress={() => open('lost')} />
          <Button label="그룹에 추가" variant="neutral" onPress={() => open('add')} />
          <Button label="내 여행 없음" variant="neutral" onPress={() => open('noTrip')} />
          <Button
            label="내 여행 불러오기 실패"
            variant="neutral"
            onPress={() => open('tripsError')}
          />
        </View>
      </ScrollView>
    );
  }

  const trips = example === 'noTrip' ? [] : TRIPS;

  return (
    <>
      <SavedPlaceView
        name="강문 해변"
        area="강릉 강문동"
        latitude={37.7953}
        longitude={128.9184}
        memo={memo}
        source={example === 'lost' ? 'lost' : 'feed'}
        editable
        onBack={() => setExample(null)}
        onUnsave={() =>
          toast.show('저장을 해제했어요', {
            action: { label: '되돌리기', onPress: () => toast.show('다시 저장했어요') },
          })
        }
        onEditMemo={() => {
          setMemoKey((k) => k + 1);
          setMemoOpen(true);
        }}
        onOpenSource={() => toast.show('준비 중이에요')}
        onAddToTrip={() => {
          setTripId(null);
          setAddOpen(true);
        }}
      />
      <MemoSheet
        key={memoKey}
        visible={memoOpen}
        memo={memo}
        onClose={() => setMemoOpen(false)}
        onSave={(next) => {
          setMemo(next);
          setMemoOpen(false);
          toast.show('메모를 저장했어요');
        }}
      />
      <AddToTripSheet
        visible={addOpen}
        placeName="강문 해변"
        trips={trips}
        tripsStatus={example === 'tripsError' ? 'error' : 'ready'}
        onRetryTrips={() => setExample('add')}
        selectedId={tripId}
        onSelect={setTripId}
        onClose={() => setAddOpen(false)}
        onAdd={() => {
          const trip = trips.find((t) => t.id === tripId);
          setAddOpen(false);
          if (trip) toast.show(`${trip.title}에 담았어요`);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
