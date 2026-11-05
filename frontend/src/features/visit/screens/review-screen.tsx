import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CenterNotice, ConfirmSheet, Header, toast } from '@/components/ui';
import { colors } from '@/theme';

import { DeleteReviewSheet } from '../components/delete-review-sheet';
import type { ReviewCardData } from '../components/review-card';
import { ReviewView } from '../components/review-view';
import { useReviewBoard } from '../hooks/use-review-board';
import { useDeleteReview, useSaveReview } from '../hooks/use-review-mutations';
import {
  canSaveReview,
  companionReviewsOf,
  myReviewOf,
  placeNameOf,
  reviewFailure,
  seoulDayLabel,
  visitWhen,
} from '../review-rules';
import type { Review } from '../types';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * S34 평점·평가 작성. S33 [평가하기]·내 점수에서 연다(/trips/{tripId}/visits/{visitId}).
 * 처음엔 작성, 평가가 있으면 남긴 뒤. [수정]은 내 점수·글을 채운 작성으로, [삭제]는 S50 확인 시트를 거친다
 */
export function ReviewScreen() {
  const { tripId, visitId } = useLocalSearchParams<{ tripId: string; visitId: string }>();
  const board = useReviewBoard(tripId, visitId);
  const save = useSaveReview(tripId, visitId);
  const remove = useDeleteReview(tripId, visitId);

  // 고치는 중이면 처음 값(내 평가)을 기억해 [뒤로] 때 바뀐 게 있는지 본다
  const [editing, setEditing] = useState<Review | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (board.isLoading || board.error || !board.trip || !board.visit) {
    return (
      <View style={styles.screen}>
        <Header title="평가" />
        {board.isLoading ? (
          <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
        ) : board.error || !board.trip ? (
          <CenterNotice
            icon="alert"
            title="평가를 불러오지 못했어요"
            description="다시 시도해 주세요"
            actionLabel="다시 시도"
            actionIcon="refresh"
            onAction={board.refetch}
            secondaryLabel="돌아가기"
            onSecondary={goBack}
          />
        ) : (
          // 내 방문 목록에 이 방문이 없다: 체크를 해제했거나 남의 방문
          <CenterNotice
            icon="map-pin"
            title="평가할 방문을 찾지 못했어요"
            description="다녀온 곳 체크를 해제한 장소예요"
            actionLabel="돌아가기"
            onAction={goBack}
          />
        )}
      </View>
    );
  }

  const { trip, visit, items, reviews } = board;
  const myReview = myReviewOf(visit, reviews);
  const mode = myReview && !editing ? 'done' : 'write';
  const startScore = editing?.score ?? null;
  const startBody = editing?.body ?? '';
  const dirty = mode === 'write' && (score !== startScore || body !== startBody);

  const member = (memberId: string) => trip.members.find((m) => m.id === memberId);
  const card = (r: Review): ReviewCardData => {
    const m = member(r.authorMemberId);
    return {
      id: r.id,
      name: m?.user.nickname ?? '나간 동행',
      imageUrl: m?.user.profileImageUrl ?? null,
      score: r.score,
      date: seoulDayLabel(r.createdAt),
      body: r.body,
    };
  };

  const reset = () => {
    setEditing(null);
    setScore(null);
    setBody('');
    setSaveFailed(false);
  };

  const onSave = () =>
    save.mutate(
      { score: score as number, body, ...(editing ? { expectedVersion: editing.version } : {}) },
      {
        onSuccess: () => {
          reset();
          toast.success('평가를 남겼어요');
        },
        onError: (error) => {
          const kind = reviewFailure(error);
          if (kind === 'error') {
            setSaveFailed(true);
            return;
          }
          // 그 사이 다른 기기에서 평가가 바뀌었거나 방문·평가가 없어졌다. 서버 상태를 다시 읽어 보여 준다
          reset();
          toast.error(
            kind === 'conflict'
              ? '다른 곳에서 평가가 바뀌었어요. 다시 확인해 주세요'
              : '방문 기록이 바뀌었어요. 다시 확인해 주세요',
          );
          void board.refetch();
        },
      },
    );

  const onDeleteConfirm = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        setDeleting(false);
        setDeleteFailed(false);
        reset();
        toast.success('평가를 삭제했어요');
      },
      onError: () => setDeleteFailed(true),
    });

  return (
    <>
      <ReviewView
        tripTitle={trip.title}
        people={trip.members.map((m) => ({
          name: m.user.nickname,
          imageUrl: m.user.profileImageUrl,
          me: m.user.id === board.myUserId,
        }))}
        placeName={placeNameOf(visit, items, reviews)}
        when={visitWhen(visit, items, trip.startDate)}
        evidence={visit.evidenceType}
        mode={mode}
        score={score}
        body={body}
        onScore={(s) => {
          setScore(s);
          setSaveFailed(false);
        }}
        onBody={(b) => {
          setBody(b);
          setSaveFailed(false);
        }}
        canSave={canSaveReview(score, body)}
        saving={save.isPending}
        saveFailed={saveFailed}
        onSave={onSave}
        myReview={myReview ? card(myReview) : null}
        companions={companionReviewsOf(visit, reviews).map(card)}
        onEdit={() => {
          if (!myReview) return;
          setEditing(myReview);
          setScore(myReview.score);
          setBody(myReview.body);
          setSaveFailed(false);
        }}
        onDelete={() => {
          setDeleteFailed(false);
          setDeleting(true);
        }}
        onBack={() => (dirty ? setLeaving(true) : goBack())}
      />
      <DeleteReviewSheet
        visible={deleting}
        placeName={placeNameOf(visit, items, reviews)}
        onClose={() => setDeleting(false)}
        onConfirm={onDeleteConfirm}
        deleting={remove.isPending}
        failed={deleteFailed}
      />
      {/* 값 문서: [뒤로]는 입력한 것이 있으면 버릴지 확인 */}
      <ConfirmSheet
        visible={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          goBack();
        }}
        title="평가 쓰기를 그만둘까요?"
        description="입력한 내용은 저장되지 않아요"
        confirmLabel="그만두기"
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
