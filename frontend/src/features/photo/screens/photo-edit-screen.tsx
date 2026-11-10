import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, ConfirmSheet, toast } from '@/components/ui';
import { layout } from '@/theme';

import { CoursePlaceList } from '../components/course-place-list';
import { PhotoEditView } from '../components/photo-edit-view';
import { useSearchPlace } from '../hooks/use-search-place';
import { useDeletePhotos, useSavePhotoEdits, useTripPhotos } from '../hooks/use-trip-photos';
import {
  commonTopic,
  pendingChanges,
  stageEdit,
  withEdits,
  type PhotoEdits,
} from '../photo-edit-rules';
import { courseDays } from '../photo-list-rules';

/**
 * S32 사진 수정(/trips/[tripId]/photos/place/[placeId]). S31 장소 묶음의 [수정]에서 온다.
 * 바꾼 것은 [완료]로 저장한다. 저장 전에 [뒤로]·기기 뒤로로 나가려 하면 확인한다
 */
export function PhotoEditScreen() {
  const { tripId = '', placeId = '' } = useLocalSearchParams<{
    tripId: string;
    placeId: string;
  }>();
  const data = useTripPhotos(tripId);
  const save = useSavePhotoEdits(tripId);
  const remove = useDeletePhotos(tripId);

  const [edits, setEdits] = useState<PhotoEdits>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [placeSheet, setPlaceSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // S13에서 고른 코스 밖 장소. 시트를 다시 열어도 목록에 남긴다
  const [searched, setSearched] = useState<{ id: string; name: string } | null>(null);
  const searchPlace = useSearchPlace(data.trip, data.course);

  const base = useMemo(
    () => data.photos.filter((p) => p.placeId === placeId),
    [data.photos, placeId],
  );
  const shown = useMemo(() => base.map((p) => withEdits(p, edits)), [base, edits]);
  const picked = shown.filter((p) => selected.has(p.id));
  const changes = pendingChanges(base, edits);
  // 검색으로 고른 장소는 아직 저장 전이라 S31 묶음 이름에 없다. 고른 이름을 먼저 쓴다
  const nameOf = (id: string | null) =>
    !id
      ? null
      : id === searched?.id
        ? searched.name
        : (data.group(shown.filter((p) => p.placeId === id))[0]?.name ?? null);
  const pickedPlaceIds = [...new Set(picked.map((p) => p.placeId))];
  const selectedPlaceName =
    pickedPlaceIds.length > 1 ? '여러 장소' : nameOf(pickedPlaceIds[0] ?? null);

  usePreventRemove(changes.length > 0 && !leaving, () => setConfirmLeave(true));

  // S31로는 한 번만 나간다. 사진을 모두 다른 장소로 옮기고 [완료]를 누르면 저장이 끝나는 같은 렌더에서
  // [완료]의 나가기와 "묶음이 비면 나가기"가 함께 돌아 S31까지 닫힐 수 있다(!168 리뷰)
  const left = useRef(false);
  useEffect(() => {
    if (!leaving || left.current) return;
    left.current = true;
    router.back();
  }, [leaving]);

  // 사진이 모두 지워지거나 다른 장소로 옮겨져 이 묶음이 비면 S31로
  const empty = data.state === 'ready' && base.length === 0;
  useEffect(() => {
    if (!empty || remove.isPending || save.isPending || left.current) return;
    left.current = true;
    router.back();
  }, [empty, remove.isPending, save.isPending]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const done = () => {
    if (changes.length === 0) {
      setLeaving(true);
      return;
    }
    save.mutate(changes, {
      onSuccess: ({ saved, failedIds }) => {
        if (failedIds.length === 0) {
          toast.success(`사진 ${saved}장을 바꿨어요`);
          setEdits({});
          setLeaving(true);
          return;
        }
        // 저장한 사진의 바꿈은 지우고 실패한 것만 남겨 다시 시도한다
        setEdits((prev) => Object.fromEntries(failedIds.map((id) => [id, prev[id]])));
        toast.error(`${failedIds.length}장을 바꾸지 못했어요`, {
          // 다시 시도는 남은(실패한) 바꿈으로 다시 저장한다(지금 함수는 이전 바꿈을 들고 있어 최신 것을 부른다)
          action: { label: '다시 시도', onPress: () => doneRef.current() },
        });
      },
    });
  };

  // 시트를 닫고 S13을 연다(시트가 떠 있으면 검색 화면 위를 덮는다). 고른 장소는 다른 바꿈처럼 [완료]에 저장
  const search = async () => {
    setPlaceSheet(false);
    const place = await searchPlace();
    if (!place) return;
    setSearched(place);
    setEdits((prev) => stageEdit(prev, selected, { placeId: place.id }));
  };

  const doneRef = useRef(done);
  useEffect(() => {
    doneRef.current = done;
  });

  const runDelete = () => {
    const ids = picked.map((p) => p.id);
    remove.mutate(ids, {
      onSuccess: ({ deleted, failed }) => {
        setConfirmDelete(false);
        setSelected(new Set());
        setEdits((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))),
        );
        if (failed === 0) toast.success(`사진 ${deleted}장을 지웠어요`);
        else toast.error(`${failed}장을 지우지 못했어요. 다시 시도해 주세요`);
      },
    });
  };

  return (
    <>
      <PhotoEditView
        state={data.state}
        tripTitle={data.trip?.title ?? null}
        placeName={data.group(base)[0]?.name ?? null}
        photos={shown}
        selected={selected}
        topic={commonTopic(picked)}
        selectedPlaceName={selectedPlaceName}
        changed={changes.length}
        saving={save.isPending}
        memberName={data.memberName}
        myMemberId={data.myMemberId}
        onBack={() => (changes.length > 0 ? setConfirmLeave(true) : router.back())}
        onDone={done}
        onToggle={toggle}
        onTopic={(topic) => setEdits((prev) => stageEdit(prev, selected, { topic }))}
        onChangePlace={() => setPlaceSheet(true)}
        onDelete={() => setConfirmDelete(true)}
        onRetry={data.retry}
      />
      <BottomSheet
        visible={placeSheet}
        onClose={() => setPlaceSheet(false)}
        title="어디서 찍었나요?"
        description="코스 장소에서 고르거나 검색해요"
      >
        <View style={styles.sheet}>
          <CoursePlaceList
            days={courseDays(data.course, data.trip?.startDate ?? null)}
            state={data.courseState as 'loading' | 'error' | 'ready'}
            placeId={pickedPlaceIds.length === 1 ? (pickedPlaceIds[0] ?? null) : null}
            onPlace={(id) => {
              setEdits((prev) => stageEdit(prev, selected, { placeId: id }));
              setPlaceSheet(false);
            }}
            picked={
              searched ??
              (pickedPlaceIds.length === 1 && pickedPlaceIds[0] && selectedPlaceName
                ? { id: pickedPlaceIds[0], name: selectedPlaceName }
                : null)
            }
            onSearch={() => void search()}
          />
        </View>
      </BottomSheet>
      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={runDelete}
        title={`사진 ${picked.length}장을 지울까요?`}
        description="지우면 동행도 이 사진을 볼 수 없고, 되돌릴 수 없어요"
        confirmLabel="지우기"
        confirmIcon="trash"
        loading={remove.isPending}
      />
      <ConfirmSheet
        visible={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          setLeaving(true);
        }}
        title="바꾼 것을 저장하지 않고 나갈까요?"
        description={`${changes.length}장의 주제·장소 바꿈이 사라져요`}
        confirmLabel="저장하지 않고 나가기"
        cancelLabel="계속 고치기"
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingBottom: layout.screenPaddingX },
});
