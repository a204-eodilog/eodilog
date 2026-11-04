import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, CenterNotice, Header } from '@/components/ui';
import { MyTripsView } from '@/features/my-trips/components/my-trips-view';
import type { MyTrip, MyTripStatus } from '@/features/my-trips/types';
import { colors, layout, spacing } from '@/theme';

/**
 * 개발용 N4 상태 보기. 서버 없이 값 문서(docs/design/screens/N4-my-trips.md)의 예시 데이터로 그린다.
 * 앱 흐름에는 안 나오고 /dev/my-trips로만 들어온다.
 */

const ME = 'me';

function person(id: string, nickname: string, joinOrder: number) {
  return {
    id: `m-${id}`,
    joinOrder,
    user: {
      id,
      nickname,
      profileImageUrl: null,
      accountVisibility: 'PUBLIC' as const,
      followingStatus: 'NONE' as const,
      followedByStatus: 'NONE' as const,
    },
  };
}

function trip(
  id: string,
  title: string,
  status: MyTripStatus,
  startDate: string | null,
  endDate: string | null,
  companions: string[],
): MyTrip {
  return {
    id,
    title,
    status,
    startDate,
    endDate,
    members: [person(ME, '지우', 1), ...companions.map((name, i) => person(name, name, i + 2))],
  };
}

const TRIPS = [
  trip('t1', '겨울 여행', 'COMPLETED', '2026-11-14', '2026-11-15', ['서연', '민준']),
  trip('t2', '여름 캠핑', 'COMPLETED', '2026-08-08', '2026-08-09', ['하늘']),
  trip('t3', '봄 경주', 'COMPLETED', '2026-04-11', '2026-04-12', ['서연']),
  trip('t4', '연말 강릉', 'PLANNING', '2026-12-26', '2026-12-27', ['민준', '지우2']),
  trip('t5', '부산 먹방', 'PLANNING', null, null, ['서연', '민준', '하늘']),
  trip('t6', '혼자 제주', 'PLANNING', '2027-01-10', '2027-01-12', []),
];

type Example = 'list' | 'empty' | 'error';

export default function MyTripStates() {
  const [view, setView] = useState<Example | null>(null);
  const back = () => setView(null);

  if (view === 'list' || view === 'empty') {
    return (
      <MyTripsView
        trips={view === 'empty' ? [] : TRIPS}
        myUserId={ME}
        onOpen={back}
        onBack={back}
      />
    );
  }

  if (view === 'error') {
    return (
      <View style={styles.screen}>
        <Header onBack={back} />
        <CenterNotice
          icon="trip"
          tone="brand"
          title="내 여행 목록을 불러오지 못했어요"
          description="불러오지 못했어요. 다시 시도해 주세요."
          actionLabel="다시 시도"
          actionIcon="refresh"
          onAction={back}
          secondaryLabel="돌아가기"
          onSecondary={back}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.menu} style={styles.screen}>
      <View style={styles.row}>
        <Button label="기본" variant="neutral" onPress={() => setView('list')} />
        <Button label="여행 없음" variant="neutral" onPress={() => setView('empty')} />
        <Button label="불러오기 실패" variant="neutral" onPress={() => setView('error')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
