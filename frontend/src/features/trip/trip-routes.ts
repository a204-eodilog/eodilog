import type { TodoTarget } from './trip-rules';

/**
 * 여행 상세 지금 할 일 버튼이 가는 주소.
 * 폴더로 된 화면(course, photos)은 여행 메뉴와 같이 실제 주소로 보낸다.
 * 피드는 게시 화면이 정해지지 않아 null이고, null이면 준비 중 안내를 띄운다
 */
export function todoHref(target: TodoTarget, tripId: string): string | null {
  switch (target) {
    case 'favorites':
      return `/trips/${tripId}/favorites`;
    case 'course':
      return `/trips/${tripId}/course`;
    case 'today':
      return `/trips/${tripId}/today`;
    case 'photos':
      return `/trips/${tripId}/photos`;
    default:
      return null;
  }
}
