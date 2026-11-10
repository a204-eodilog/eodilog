import { tripKey } from '@/features/trip/hooks/use-trip';

/** 여행의 준비물 목록. 여행 캐시 아래에 두어 여행을 지우거나 나가면 함께 버려진다 */
export const checklistKey = (tripId: string) => [...tripKey(tripId), 'checklist'] as const;
