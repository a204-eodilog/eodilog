import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';

import { toast } from '@/components/ui';
import { getItinerary, replaceItinerary } from '@/features/course/api';
import { createTrip, searchRegions } from '@/features/trip/api';
import { invalidateAfterJoin } from '@/features/trip/hooks/trip-cache';
import type { CreateTripBody, Trip } from '@/features/trip/types';

import { toOurPlace } from '../api';
import { clearVoiceTrip } from '../voice-trip-store';
import { toItineraryWrite, pickRegion, type TripVoiceDraft } from '../voice-trip-rules';

/** 장소를 우리 장소로 바꿀 때 한 번에 보내는 수 */
const PLACE_CONCURRENCY = 3;

/**
 * 초안으로 여행을 만든다. 여행지 이름 → 지역, 여행 만들기, 장소를 우리 장소로, 코스 저장 순서다.
 * 여행은 만들었는데 코스 저장이 안 되면 여행 상세로 가고 알린다(코스는 거기서 다시 짠다).
 */
export function useCreateFromVoice() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // 응답을 못 받고 다시 누르면 같은 키로 보내 여행이 하나만 생긴다
  const key = useRef<{ body: string; key: string } | null>(null);
  const made = useRef<Trip | null>(null);

  const create = async (draft: TripVoiceDraft, withCourse: boolean) => {
    if (busy) return;
    try {
      let trip = made.current;
      if (!trip) {
        setBusy('여행지를 맞추고 있어요');
        const regionIds: string[] = [];
        for (const d of draft.destinations) {
          try {
            const found = await searchRegions(d.name);
            const region = pickRegion(d.name, found.data);
            if (region && !regionIds.includes(region.id)) regionIds.push(region.id);
          } catch {
            // 못 맞춘 여행지는 비워 둔다(나중에 정한다)
          }
        }
        const body: CreateTripBody = {
          title: draft.title.trim() || '새 여행',
          ...(draft.startDate && draft.endDate
            ? { startDate: draft.startDate, endDate: draft.endDate }
            : {}),
          ...(regionIds.length ? { destinationRegionIds: regionIds } : {}),
        };
        const serialized = JSON.stringify(body);
        if (key.current?.body !== serialized) key.current = { body: serialized, key: randomUUID() };
        setBusy('여행을 만들고 있어요');
        trip = await createTrip(body, key.current.key);
        made.current = trip;
        invalidateAfterJoin(queryClient);
      }

      let courseSaved = true;
      const placed = draft.items.filter((i) => i.place);
      if (withCourse && trip.startDate && placed.length > 0) {
        setBusy('코스를 넣고 있어요');
        courseSaved = await saveCourse(trip, draft);
      }

      clearVoiceTrip();
      made.current = null;
      key.current = null;
      router.replace({ pathname: '/trips/[tripId]', params: { tripId: trip.id } });
      if (courseSaved) {
        toast.success('여행을 만들었어요. 같이 갈 친구를 초대해 보세요');
      } else {
        toast.error('여행은 만들었는데 코스를 넣지 못했어요. 코스 짜기에서 다시 넣어 주세요');
      }
    } catch {
      toast.error('여행을 만들지 못했어요. 초안은 그대로 있어요. 다시 눌러 주세요');
    } finally {
      setBusy(null);
    }
  };

  return { create, busy };
}

async function saveCourse(trip: Trip, draft: TripVoiceDraft): Promise<boolean> {
  try {
    const regionId = trip.destinationRegionIds[0];
    const ids = new Map<string, string>();
    const queue = draft.items.filter((i) => i.place);
    for (let at = 0; at < queue.length; at += PLACE_CONCURRENCY) {
      const batch = queue.slice(at, at + PLACE_CONCURRENCY);
      const ours = await Promise.all(batch.map((i) => toOurPlace(i.place!, regionId)));
      batch.forEach((item, index) => {
        const place = ours[index];
        if (place) ids.set(item.key, place.id);
      });
    }
    if (ids.size === 0) return false;
    const current = await getItinerary(trip.id);
    await replaceItinerary(trip.id, toItineraryWrite(draft, ids, current.version));
    return ids.size === queue.length;
  } catch {
    return false;
  }
}
