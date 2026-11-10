/**
 * 알림 서버 응답(백엔드 notification/NotificationView). 서버가 아직 tripId를 주지 않아 선택 필드로 둔다(Q-12-1).
 * 종류는 서버가 더 늘릴 수 있어 string으로 받고 notification-rules의 표에 없는 종류는 '알림'으로 보인다
 */
export type NotificationTarget = { type: string; id: string };

export type NotificationView = {
  id: string;
  eventId: string;
  kind: string;
  message: string | null;
  target: NotificationTarget | null;
  tripId?: string | null;
  readAt: string | null;
  createdAt: string;
};

/** S48 팝업에 뜨는 투표 정보. 투표 화면 브랜치의 Poll 중 필요한 칸만 */
export type PollBrief = { type: 'REGION' | 'PLACE'; closesAt: string };
