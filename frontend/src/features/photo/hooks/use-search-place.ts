import { useQueryClient } from '@tanstack/react-query';

import type { Trip } from '@/api/types';
import { pickPlace } from '@/features/place';

import type { CoursePlace } from '../types';

/**
 * 사진 장소를 S13 장소 검색에서 고른다(S31 장소 미지정, S32 장소 바꾸기).
 * 여행 첫 목적지 지역 안에서 먼저 찾고, 지도에서 고르기는 코스 첫 장소 근처에서 연다(좌표가 있을 때).
 * 고른 장소 이름은 S31 묶음 이름(['places', id, 'name'])에 미리 넣어 다시 읽지 않게 한다
 */
export function useSearchPlace(trip: Trip | null, course: CoursePlace[]) {
  const queryClient = useQueryClient();
  return async (): Promise<{ id: string; name: string } | null> => {
    const first = course.find(
      (c) => c.place.latitude !== undefined && c.place.longitude !== undefined,
    )?.place;
    const place = await pickPlace({
      regionId: trip?.destinationRegionIds[0],
      near:
        first?.latitude !== undefined && first.longitude !== undefined
          ? { latitude: first.latitude, longitude: first.longitude }
          : undefined,
    });
    if (!place) return null;
    queryClient.setQueryData(['places', place.id, 'name'], place.name);
    return { id: place.id, name: place.name };
  };
}
