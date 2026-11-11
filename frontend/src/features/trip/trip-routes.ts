import type { TodoTarget } from './trip-rules';

/**
 * 여행 상세 지금 할 일 버튼이 가는 주소.
 * 폴더로 된 화면(course, photos)은 여행 메뉴와 같이 실제 주소로 보낸다.
 * 피드는 내 여행 기록(S38)으로 간다. 그 화면의 [게시]가 게시 확인 시트를 연다
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
    case 'feed':
      return publishHref(tripId);
    default:
      return null;
  }
}

/**
 * 게시하러 가는 주소. 내 여행 기록(S38, 다른 담당 화면)이 게시 전·게시됨 상태와 [게시] 버튼, 게시 확인 시트를 갖고 있다.
 * 여행 메뉴의 "게시"와 여행 상세의 [피드로 게시]가 쓴다. 시트를 바로 띄우려면 그 화면이 받아 줘야 해서, 화면까지만 간다
 */
export function publishHref(tripId: string): string {
  return `/trips/${tripId}/record`;
}
