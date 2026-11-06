import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { toast } from '@/components/ui';
import { PlaceInfoSheet, usePlaceSave } from '@/features/place';

import { getRegionDetail, getTrends } from '../api';
import { DestinationView } from '../components/destination-view';
import { TrendsView } from '../components/trends-view';
import { toDestinationInfo, toTrendBoard, trendRange } from '../destination-rules';
import type { DestinationInfo, TrendRegion } from '../types';

/** S09 최근 트렌드 여행지 /trends. S05 [요즘 뜨는 여행지]에서 들어온다 */
export function TrendsScreen() {
  const range = useMemo(() => trendRange(), []);
  const trends = useQuery({
    queryKey: ['trends', 'regions', range.from, range.to],
    queryFn: () => getTrends(range.from, range.to),
  });
  return (
    <TrendsView
      state={trends.isError ? 'error' : trends.data ? 'ready' : 'loading'}
      board={trends.data ? toTrendBoard(trends.data, range) : undefined}
      refreshing={trends.isRefetching}
      onRefresh={() => void trends.refetch()}
      onRow={(r) => router.push(`/regions/${r.regionId}`)}
      onBack={() => router.back()}
      onRetry={() => void trends.refetch()}
    />
  );
}

/** N3 여행지 정보 /regions/[regionId] */
export function DestinationScreen() {
  const { regionId = '' } = useLocalSearchParams<{ regionId: string }>();
  const detail = useQuery({
    // ['regions', id]는 여행 기능이 Region(지역 하나)으로 기억해 두는 자리라 겹치지 않게 따로 둔다
    queryKey: ['regions', regionId, 'detail'],
    queryFn: () => getRegionDetail(regionId),
  });
  const [placeId, setPlaceId] = useState<string | null>(null);
  const placeSave = usePlaceSave();
  return (
    <>
      <DestinationView
        state={detail.isError ? 'error' : detail.data ? 'ready' : 'loading'}
        info={detail.data ? toDestinationInfo(detail.data) : undefined}
        onPlace={setPlaceId}
        onSavePlace={placeSave.open}
        onNewTrip={() => router.push({ pathname: '/trips/new', params: { regionId } })}
        onRetry={() => void detail.refetch()}
      />
      <PlaceInfoSheet
        placeId={placeId}
        onClose={() => setPlaceId(null)}
        onSave={(place) => {
          setPlaceId(null);
          placeSave.open(place);
        }}
      />
      {placeSave.sheet}
    </>
  );
}

// ── 미리보기 ──

const trend = (
  rank: number,
  code: string,
  name: string,
  trips: number,
  friends: number,
  move: { isNew?: boolean; change?: number | null },
): TrendRegion => ({
  region: { id: `r-${code}`, code, name, parentId: null, latitude: null, longitude: null },
  rank,
  previousRank: null,
  rankChange: move.change ?? null,
  isNew: move.isNew ?? false,
  publishedTripCount: trips,
  followingCount: friends,
  from: '2026-09-24',
  to: '2026-10-23',
  sampleSize: 500,
  updatedAt: new Date(new Date().setHours(6, 0, 0, 0)).toISOString(),
  insufficientData: false,
});

/** Figma S09 기본 7곳 */
const TRENDS = [
  trend(1, '5115000000', '강원특별자치도 강릉시', 128, 3, { change: 2 }),
  trend(2, '4713000000', '경상북도 경주시', 104, 2, { change: -1 }),
  trend(3, '1213000000', '전남광주통합특별시 여수시', 97, 1, { isNew: true }),
  trend(4, '5011000000', '제주특별자치도 제주시', 88, 2, { change: -2 }),
  trend(5, '5211000000', '전북특별자치도 전주시', 71, 0, { change: 0 }),
  trend(6, '5121000000', '강원특별자치도 속초시', 65, 0, { change: 1 }),
  trend(7, '4822000000', '경상남도 통영시', 58, 0, { isNew: true }),
];

/** /dev/trends?state=basic|insufficient|loading|error */
export function TrendsPreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  if (!__DEV__) return <Redirect href="/" />;
  const range = { from: '2026-09-24', to: '2026-10-23' };
  const items =
    state === 'insufficient' ? TRENDS.map((t) => ({ ...t, insufficientData: true })) : TRENDS;
  return (
    <TrendsView
      state={state === 'loading' || state === 'error' ? state : 'ready'}
      board={toTrendBoard(items, range)}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 800);
      }}
      onRow={(r) => toast.show(`${r.name}: N3 여행지 정보로 가요`)}
      onBack={() => toast.show('홈으로 돌아가요')}
      onRetry={() => toast.show('다시 불러와요')}
    />
  );
}

/** Figma N3 강릉 */
const DEST: DestinationInfo = {
  regionId: 'r-5115000000',
  name: '강릉',
  area: '강원',
  introduction: '겨울 바다와 커피 거리',
  places: [
    { id: 'p1', name: '강문 해변', address: '강원 강릉시 강문동' },
    { id: 'p2', name: '안목 바다뷰 카페', address: '강원 강릉시 견소동' },
    { id: 'p5', name: '주문진 어시장', address: '강원 강릉시 주문진읍' },
  ],
  photos: [],
};

/** /dev/destination?state=basic|loading|error */
export function DestinationPreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: string }>();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <DestinationView
      state={state === 'loading' || state === 'error' ? state : 'ready'}
      info={DEST}
      onPlace={(id) => toast.show(`${id}: N7 장소 정보 시트를 열어요`)}
      onSavePlace={() => toast.show('S08 장소 저장 시트를 열어요')}
      onNewTrip={() => toast.show('강릉을 넣고 S16 새 여행으로 가요')}
      onRetry={() => toast.show('다시 불러와요')}
    />
  );
}
