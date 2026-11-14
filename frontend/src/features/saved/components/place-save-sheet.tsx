import { router, usePathname } from 'expo-router';
import { useRef, useState } from 'react';

import { toast } from '@/components/ui';

import { type SaveTarget, useSavePlaces } from '../hooks/use-bookmark-mutations';
import { useTripOptions } from '../hooks/use-trip-options';
import {
  placeSavedMessage,
  placeSaveState,
  SAVED_TAB_PATH,
  type SaveChoice,
  savesPersonal,
  savesTrip,
  showSavedLink,
  toggleSaveChoice,
} from '../saved-rules';

import { PlaceSaveSheetView } from './place-save-sheet-view';

/** 저장할 장소. 장소 id는 GET /places, S13 장소 검색, 공동 피드 응답의 Place.id */
export type SavePlace = { id: string; name: string };

export type PlaceSaveSheetProps = {
  visible: boolean;
  /** 한 곳(S07·N3·N7·S47) 또는 여러 곳(S12에서 찾은 장소) */
  places: SavePlace[];
  /**
   * 처음 고른 저장 위치. 기본은 동행과 같이(값 문서 "기본"),
   * S12에서 찾은 장소는 나만 보기(값 문서 "가져온 장소")
   */
  initialChoice?: SaveChoice;
  /** 같이 저장할 메모(S11에서 쓴 메모). 없으면 이미 저장한 장소의 메모를 그대로 둔다 */
  memo?: string;
  onClose: () => void;
  /** 저장한 뒤. 시트는 이미 닫혔고 토스트도 떠 있다. S12는 여기서 S10(개인) 또는 S20(그룹)으로 간다 */
  onSaved?: (target: SaveTarget) => void;
  /** 개인 저장 뒤 onSaved가 S10으로 데려가면 true(S12). 완료 안내에 [보기]를 붙이지 않는다 */
  opensSavedTab?: boolean;
};

/**
 * S08 장소 저장 시트. S07·N3·N7(A), S47(C), S12(B)에서 연다.
 * 나만 보기 → PUT /me/bookmarks/{placeId}, 동행과 같이 → PUT /trips/{tripId}/saved-places/{placeId}/me.
 * 두 칸을 모두 켜면 두 곳에 한 번에 저장한다(2026-11-14 사용자 결정).
 * 성공하면 시트를 닫고 위 한 줄 안내를 띄운다. 개인은 "개인 즐겨찾기에 저장했어요" + [보기] → S10(
 * 이미 S10이거나 S10으로 가면 [보기] 없이), 여행은 토스트("OO에 담았어요"),
 * 실패하면 시트에 오류 띠를 띄우고 [다시 저장].
 * 그룹 토스트의 [보기](→ S20 그룹 즐겨찾기, C)는 화면이 생기면 붙인다
 *
 * @example
 * <PlaceSaveSheet visible={open} places={[{ id: place.id, name: place.name }]} onClose={() => setOpen(false)} />
 */
export function PlaceSaveSheet({
  visible,
  places,
  initialChoice = 'trip',
  memo,
  onClose,
  onSaved,
  opensSavedTab = false,
}: PlaceSaveSheetProps) {
  const pathname = usePathname();
  const [choice, setChoice] = useState<SaveChoice>(initialChoice);
  const [tripId, setTripId] = useState<string | null>(null);
  const trips = useTripOptions(visible);
  const save = useSavePlaces();
  // 빠르게 두 번 누르면 다시 그리기 전이라 isPending이 아직 false라서 ref로 바로 막는다(!137 리뷰)
  const saving = useRef(false);

  // 값 문서 "기본": 여행 목록의 첫 번째가 골라져 있다
  const selectedTripId = tripId ?? trips.trips[0]?.id ?? null;
  const { target } = placeSaveState({
    choice,
    tripsStatus: trips.status,
    tripCount: trips.trips.length,
    selectedTripId,
  });

  // 다음에 열 때 처음 상태로 시작한다
  const close = () => {
    setChoice(initialChoice);
    setTripId(null);
    save.reset();
    onClose();
  };

  const onSave = () => {
    if (saving.current) return;
    const trip = savesTrip(target) ? trips.trips.find((t) => t.id === selectedTripId) : null;
    if (savesTrip(target) && !trip) return;
    const personal = savesPersonal(target);
    const targets: SaveTarget[] = [
      ...(personal ? [{ kind: 'personal' } as const] : []),
      ...(trip ? [{ kind: 'trip', tripId: trip.id } as const] : []),
    ];
    // 저장한 뒤 데려갈 곳. 개인에도 담았으면 개인 저장 탭, 여행에만 담았으면 그 여행
    const saveTarget: SaveTarget = personal || !trip ? { kind: 'personal' } : targets[0];
    saving.current = true;
    save.mutate(
      { placeIds: places.map((p) => p.id), targets, memo },
      {
        // close()가 mutation을 reset하면 onSettled가 불리지 않을 수 있어 성공·실패 콜백 맨 앞에서 푼다
        onError: () => {
          saving.current = false;
        },
        onSuccess: () => {
          saving.current = false;
          close();
          // 안내는 모두 화면 위 한 줄 알약(공통 toast). 개인 저장은 [보기] → S10을 붙이되,
          // 이미 S10을 보고 있거나 S10으로 가면 [보기] 없이 짧게
          toast.success(
            placeSavedMessage(trip?.title ?? null, personal),
            personal && showSavedLink(pathname, opensSavedTab)
              ? { action: { label: '보기', onPress: () => router.push(SAVED_TAB_PATH) } }
              : undefined,
          );
          onSaved?.(saveTarget);
        },
      },
    );
  };

  return (
    <PlaceSaveSheetView
      visible={visible}
      placeNames={places.map((p) => p.name)}
      choice={choice}
      onToggle={(cell) => {
        // 내 여행이 없어 개인으로만 저장되는 때는 바꿀 것이 없다
        setChoice(toggleSaveChoice(target, cell));
        save.reset();
      }}
      trips={trips.trips}
      tripsStatus={trips.status}
      onRetryTrips={trips.retry}
      selectedTripId={selectedTripId}
      onSelectTrip={(id) => {
        setTripId(id);
        save.reset();
      }}
      saving={save.isPending}
      failed={save.isError}
      onClose={close}
      onSave={onSave}
    />
  );
}
