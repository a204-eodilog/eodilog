import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { toast } from '@/components/ui';

import { FacilitiesView } from '../components/facilities-view';
import {
  type Facility,
  type FacilityType,
  getBasePlace,
  getFacilities,
  getTripHead,
  toFacilityRows,
} from '../facility';

/**
 * S28 주변 편의시설 /trips/[tripId]/facilities?placeId=. S25 여행 중(C 담당)이 기준 장소를 넘겨 연다.
 * 기준 장소 바꾸기·길찾기는 아직 연결 전(준비 중)
 */
export function FacilitiesScreen() {
  const { tripId = '', placeId = '' } = useLocalSearchParams<{
    tripId: string;
    placeId?: string;
  }>();
  const [type, setType] = useState<FacilityType>('EV_CHARGER');
  const head = useQuery({
    queryKey: ['trips', tripId, 'head'],
    queryFn: () => getTripHead(tripId),
  });
  const base = useQuery({
    queryKey: ['places', placeId],
    queryFn: () => getBasePlace(placeId),
    enabled: !!placeId,
  });
  const list = useQuery({
    queryKey: ['places', placeId, 'facilities', type],
    queryFn: () => getFacilities(placeId, type),
    enabled: !!placeId,
    retry: false,
  });
  return (
    <FacilitiesView
      tripTitle={head.data?.title ?? null}
      members={head.data?.members ?? []}
      base={base.data ?? null}
      type={type}
      state={list.isError ? 'error' : list.data ? 'ready' : 'loading'}
      rows={list.data ? toFacilityRows(list.data) : []}
      onType={setType}
      onChangeBase={() => toast.show('준비 중이에요')}
      onDirections={() => toast.show('준비 중이에요')}
      onRetry={() => void list.refetch()}
    />
  );
}

const fac = (
  id: string,
  name: string,
  minutes: number,
  availability: string | null,
  dLat: number,
  dLng: number,
): Facility => ({
  providerId: id,
  name,
  type: 'EV_CHARGER',
  latitude: 35.1577 + dLat,
  longitude: 129.0592 + dLng,
  walkingSeconds: minutes * 60,
  availability,
  queriedAt: new Date(new Date().setHours(10, 15, 0, 0)).toISOString(),
});

/** Figma S28: 서면 기준 전기차 충전소 세 곳 */
const FACILITIES = [
  fac('f1', '서면 공영주차장 충전소', 5, '급속 2대 사용 가능', 0.002, 0.003),
  fac('f2', '부전동 주차빌딩 충전소', 9, null, 0.004, -0.004),
  fac('f3', '전포 공영주차장 충전소', 12, null, -0.003, 0.005),
];

/** /dev/facilities?state=basic|error|empty|loading */
export function FacilitiesPreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: string }>();
  const [type, setType] = useState<FacilityType>('EV_CHARGER');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <FacilitiesView
      tripTitle="겨울 여행"
      members={['하늘', '가람', '나래']}
      base={{ name: '서면 돼지국밥', latitude: 35.1577, longitude: 129.0592 }}
      type={type}
      state={state === 'error' || state === 'loading' ? state : 'ready'}
      rows={state === 'empty' || type !== 'EV_CHARGER' ? [] : toFacilityRows(FACILITIES)}
      onType={setType}
      onChangeBase={() => toast.show('기준 장소를 바꿔요(여행 일정의 장소 중 고르기)')}
      onDirections={(r) => toast.show(`${r.name}: 길찾기로 가요`)}
      onRetry={() => toast.show('다시 불러와요')}
    />
  );
}
