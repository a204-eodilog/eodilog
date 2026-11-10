import { sampleCourse } from '@/features/course/testing';
import type { CourseContent, ItineraryProposal, Job } from '@/features/course/types';

/** 테스트와 미리보기 예시. sampleCourse 1일차에서 광안리를 빼고 서면을 13:00로 당긴 변경안 */

export function job(status: Job['status'] = 'SUCCEEDED'): Job {
  return {
    id: 'job-p',
    kind: 'ITINERARY_PROPOSAL',
    status,
    progress: status === 'SUCCEEDED' ? 100 : 50,
    result: null,
    error: null,
    createdAt: '2026-11-14T12:04:00',
    finishedAt: status === 'SUCCEEDED' ? '2026-11-14T12:05:00' : null,
  };
}

export function removalContent(): CourseContent {
  const c = sampleCourse(true);
  const [i1, , i3, i4] = c.items;
  return {
    items: [
      { ...i1, order: 1 },
      { ...i3, order: 2, startTime: '13:00' },
      { ...i4, order: 1 },
    ],
    legs: [{ day: 1, fromOrder: 1, toOrder: 2, transportMode: 'TRANSIT' }],
  };
}

export function proposal(overrides: Partial<ItineraryProposal> = {}): ItineraryProposal {
  return {
    job: job(),
    baseVersion: 3,
    reason: 'PLACE_REMOVED',
    proposed: removalContent(),
    diff: {
      removedPlaceIds: ['p-gwangalli'],
      addedPlaceIds: [],
      description: '광안리를 빼고 다시 짰어요',
    },
    appliedAt: null,
    canUndo: false,
    ...overrides,
  };
}
