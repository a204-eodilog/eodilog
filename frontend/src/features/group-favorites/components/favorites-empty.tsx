import { EmptyState } from '@/components/ui/empty-state';

type Props = { onAdd(): void };

/**
 * S20 장소 없음. 할 일을 하나만 보인다: 아이콘, 제목, 설명, [장소 추가].
 * 장소가 없으면 투표도 못 열고 거를 것도 없어 다른 버튼은 두지 않는다. 추천은 여행 상세에서 연다
 */
export function FavoritesEmpty({ onAdd }: Props) {
  return (
    <EmptyState
      icon="bookmark"
      title="아직 모은 장소가 없어요"
      description="가고 싶은 곳을 담으면 동행과 함께 볼 수 있어요"
      actionLabel="장소 추가"
      onAction={onAdd}
    />
  );
}
