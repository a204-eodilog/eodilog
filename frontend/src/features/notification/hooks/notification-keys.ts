/** 알림 쿼리 키. 홈 종 숫자(['me', 'notification-summary'])와 같은 머리를 써서 함께 새로 받는다 */
export const notificationKeys = {
  all: ['me', 'notification'] as const,
  list: ['me', 'notification', 'list'] as const,
  popup: ['me', 'notification', 'popup'] as const,
  summary: ['me', 'notification-summary'] as const,
  poll: (tripId: string, pollId: string) => ['me', 'notification', 'poll', tripId, pollId] as const,
};

/** 내 여행 전체 목록. 여행 탭과 같은 키라 함께 쓴다 */
export const MY_ALL_TRIPS_KEY = ['me', 'trips'] as const;
