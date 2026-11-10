import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useMemo } from 'react';

import { useMe } from '@/hooks/use-me';

import {
  batchUpdatePhotos,
  getCoursePlaces,
  getPhotoSummary,
  getPlaceName,
  getTrip,
  getTripPhotos,
  updatePhoto,
  updatePhotoPlace,
  deletePhoto,
} from '../api';
import { groupByPlace, topicChips } from '../photo-list-rules';
import { inBatches } from '../photo-rules';
import type { TripPhoto } from '../types';

/** S30 업로드가 끝나면 이 앞부분으로 목록·요약을 다시 읽게 한다 */
export const photoKeys = {
  all: (tripId: string) => ['trips', tripId, 'photos'] as const,
  summary: (tripId: string) => ['trips', tripId, 'photos', 'summary'] as const,
  course: (tripId: string) => ['trips', tripId, 'photos', 'course'] as const,
  trip: (tripId: string) => ['trips', tripId, 'photos', 'trip'] as const,
};

/**
 * S31 여행 사진 목록에 필요한 것. 사진·요약·여행이 다 와야 그린다.
 * 코스는 장소 이름·일차에만 쓰여서 못 읽어도 화면은 그린다(코스에 없는 장소 이름은 하나씩 읽는다)
 */
export function useTripPhotos(tripId: string) {
  const trip = useQuery({ queryKey: photoKeys.trip(tripId), queryFn: () => getTrip(tripId) });
  const photos = useQuery({
    queryKey: photoKeys.all(tripId),
    queryFn: () => getTripPhotos(tripId),
  });
  const summary = useQuery({
    queryKey: photoKeys.summary(tripId),
    queryFn: () => getPhotoSummary(tripId),
  });
  const course = useQuery({
    queryKey: photoKeys.course(tripId),
    queryFn: () => getCoursePlaces(tripId),
    retry: false,
  });
  const me = useMe();

  const courseItems = useMemo(() => course.data ?? [], [course.data]);
  const otherPlaceIds = useMemo(() => {
    const inCourse = new Set(courseItems.map((c) => c.place.id));
    return [
      ...new Set(
        (photos.data ?? []).flatMap((p) =>
          p.placeId && !inCourse.has(p.placeId) ? [p.placeId] : [],
        ),
      ),
    ];
  }, [photos.data, courseItems]);
  const nameQueries = useQueries({
    queries: otherPlaceIds.map((id) => ({
      queryKey: ['places', id, 'name'],
      queryFn: () => getPlaceName(id),
      staleTime: 10 * 60_000,
      // 코스 정보를 기다렸다가(코스 장소면 이름을 다시 읽지 않게) 읽는다
      enabled: !course.isPending,
    })),
  });
  const names = useMemo(
    () =>
      Object.fromEntries(
        otherPlaceIds.flatMap((id, i) => (nameQueries[i]?.data ? [[id, nameQueries[i].data]] : [])),
      ) as Record<string, string>,
    [otherPlaceIds, nameQueries],
  );

  const main = [trip, photos, summary];
  const error = main.some((q) => q.isError && !q.data);
  const ready = !!trip.data && !!photos.data && !!summary.data;
  const members = trip.data?.members ?? [];
  const myMemberId = members.find((m) => m.user.id === me.data?.id)?.id ?? null;

  return {
    state: error ? ('error' as const) : !ready ? ('loading' as const) : ('ready' as const),
    trip: trip.data ?? null,
    photos: photos.data ?? [],
    unplaced: (photos.data ?? []).filter((p) => !p.placeId),
    /** 장소별 묶음(주제로 거른 사진을 넘긴다) */
    group: (list: readonly TripPhoto[]) => groupByPlace(list, courseItems, names),
    chips: summary.data ? topicChips(summary.data) : [],
    course: courseItems,
    courseState: course.isPending ? 'loading' : course.isError ? 'error' : 'ready',
    memberName: (memberId: string) => members.find((m) => m.id === memberId)?.user.nickname ?? '?',
    myMemberId,
    retry: () => main.forEach((q) => q.isError && void q.refetch()),
    refetch: () => Promise.all([photos.refetch(), summary.refetch()]),
  };
}

/**
 * 장소 미지정 사진을 장소에 연결. 한 장이면 PATCH, 여러 장이면 일괄 변경 API로 50장씩 보낸다
 * (묶음 하나는 전부 되거나 전부 안 된다). conflict: 다른 곳에서 바뀐 사진이 있어 409가 났다.
 * 내 사진만 바꿀 수 있다(남의 사진은 화면에서 고를 수 없게 막는다). 끝나면 목록·요약을 다시 읽는다
 */
export function useConnectPlace(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ photos, placeId }: { photos: TripPhoto[]; placeId: string }) => {
      let failed = 0;
      let conflict = false;
      for (const batch of inBatches(photos)) {
        try {
          if (batch.length === 1) await updatePhotoPlace(tripId, batch[0], placeId);
          else await batchUpdatePhotos(tripId, batch, { placeId });
        } catch (e) {
          failed += batch.length;
          if (isAxiosError(e) && e.response?.status === 409) conflict = true;
        }
      }
      return { connected: photos.length - failed, failed, conflict };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: photoKeys.all(tripId) }),
  });
}

/**
 * S32 저장. 바꾼 사진마다 PATCH를 차례로 보내고 실패한 사진 id를 돌려준다(그 바꿈은 화면에 남겨 다시 시도).
 * 끝나면 목록·요약을 다시 읽는다
 */
export function useSavePhotoEdits(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      changes: { photo: TripPhoto; change: Parameters<typeof updatePhoto>[2] }[],
    ) => {
      const failedIds: string[] = [];
      for (const { photo, change } of changes) {
        try {
          await updatePhoto(tripId, photo, change);
        } catch {
          failedIds.push(photo.id);
        }
      }
      return { saved: changes.length - failedIds.length, failedIds };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: photoKeys.all(tripId) }),
  });
}

/** S32 삭제(S50 확인 뒤). 한 장씩 지우고 실패 수를 돌려준다. 끝나면 목록·요약을 다시 읽는다 */
export function useDeletePhotos(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photoIds: string[]) => {
      let failed = 0;
      for (const id of photoIds) {
        try {
          await deletePhoto(tripId, id);
        } catch {
          failed += 1;
        }
      }
      return { deleted: photoIds.length - failed, failed };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: photoKeys.all(tripId) }),
  });
}
