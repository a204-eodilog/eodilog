import type { OwnFeedLite } from '@/features/feed';
import { formatPeriodShort } from '@/lib/format-date';
import { findMapRegion } from '@/lib/korea-map';

import type { MyTripPin } from './types';

/** S40에서 한 친구에게 보이는 공동 피드 카드 */
export type VisibleFeedCard = {
  id: string;
  title: string;
  period: string | null;
  coverUrl: string | null;
  /** 이 피드에 실린 것. "사진", "경로", "평점" */
  tags: string[];
};

export type FriendView = {
  pins: MyTripPin[];
  cards: VisibleFeedCard[];
  /** 이 친구에게 숨긴 피드 수 */
  hiddenCount: number;
};

type FeedWithContent = OwnFeedLite & {
  publicItinerary?: { items: unknown[] } | null;
  publicReviews?: unknown[];
};

/**
 * 특정 친구 기준으로 본 내 프로필·피드(WD-FR-27). 그 친구를 숨긴 피드는 빼고 수만 센다.
 * 숨겨도 다른 동행의 피드 경로에서는 보일 수 있다(화면 안내)
 */
export function viewFor(friendId: string, feeds: readonly FeedWithContent[]): FriendView {
  const shown = feeds.filter((f) => !f.visibility.hiddenViewerUserIds.includes(friendId));
  const byRegion = new Map<string, FeedWithContent[]>();
  for (const f of shown) {
    const code = f.regions[0]?.code;
    if (!code || !findMapRegion(code)) continue;
    byRegion.set(code, [...(byRegion.get(code) ?? []), f]);
  }
  return {
    pins: [...byRegion.entries()].map(([regionCode, list]) => ({
      regionCode,
      label: list.length === 1 ? list[0].title : `${list[0].title} 외 ${list.length - 1}개`,
      posted: true,
      tripIds: list.map((f) => f.tripId),
    })),
    cards: shown.map((f) => ({
      id: f.id,
      title: f.title,
      period: formatPeriodShort(f.startDate ?? null, f.endDate ?? null),
      coverUrl:
        f.photos?.find((p) => p.id === f.coverPhotoId)?.imageUrl ?? f.photos?.[0]?.imageUrl ?? null,
      tags: [
        ...((f.photos?.length ?? 0) > 0 ? ['사진'] : []),
        ...((f.publicItinerary?.items.length ?? 0) > 0 ? ['경로'] : []),
        ...((f.publicReviews?.length ?? 0) > 0 ? ['평점'] : []),
      ],
    })),
    hiddenCount: feeds.length - shown.length,
  };
}
