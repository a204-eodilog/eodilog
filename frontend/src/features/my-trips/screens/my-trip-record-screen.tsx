import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CenterNotice, Header, toast } from '@/components/ui';
import { DeleteFeedSheet } from '@/features/feed';
import { formatTripNights } from '@/lib/format-date';
import { colors } from '@/theme';

import { DeleteRecordSheet } from '../components/delete-record-sheet';
import { PublishSheet } from '../components/publish-sheet';
import { TripRecordView } from '../components/trip-record-view';
import { useRecordFeed } from '../hooks/use-record-feed';
import { useTripRecord } from '../hooks/use-trip-record';
import { companionNames, formatPeriod } from '../my-trip-rules';
import {
  companionLine,
  courseSummary,
  expenseSummary,
  recordFeed,
  reviewSummary,
} from '../record-rules';

const notReady = () => toast.show('준비 중이에요');

/**
 * S38 내 여행 기록. N4 여행 줄에서 연다.
 * 코스·평가·경비 요약은 지금 있는 API로 채운다. 공동 피드는 명세 §8대로 게시 전/게시됨을 그리고
 * [게시] → 게시 API, [내 노출 설정] → S39, [공동 피드 삭제] → S39 삭제 확인 시트로 잇는다.
 * 사진, 기록 삭제, 지도 핀 API가 아직 없어 그 버튼들은 준비 중 안내를 띄운다
 */
export function MyTripRecordScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const record = useTripRecord(tripId);
  const [confirming, setConfirming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [feedDeleteOpen, setFeedDeleteOpen] = useState(false);
  const feed = useRecordFeed(tripId, record.trip?.title);

  if (record.isLoading || record.error || !record.trip) {
    return (
      <View style={styles.screen}>
        <Header />
        {record.isLoading ? (
          <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
        ) : (
          <CenterNotice
            icon="alert"
            title="여행 기록을 불러오지 못했어요"
            description="불러오지 못했어요. 다시 시도해 주세요."
            actionLabel="다시 시도"
            actionIcon="refresh"
            onAction={record.refetch}
            secondaryLabel="돌아가기"
            onSecondary={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        )}
      </View>
    );
  }

  const { trip } = record;
  const period = formatPeriod(trip.startDate, trip.endDate);
  const nights = formatTripNights(trip.startDate, trip.endDate);
  const others = trip.members
    .filter((m) => m.user.id !== record.myUserId)
    .map((m) => m.user.nickname);

  return (
    <>
      <TripRecordView
        tripTitle={trip.title}
        period={period && nights ? `${period} · ${nights}` : period}
        companions={companionLine(companionNames(trip, record.myUserId))}
        feed={recordFeed(feed.feed, feed.nameById, others)}
        course={courseSummary(record.items, record.visits)}
        review={reviewSummary(record.items, record.visits)}
        expense={expenseSummary(record.expenses, record.settlement)}
        // S31 사진 목록, S24 코스 화면은 아직 없다
        onPhotos={notReady}
        onCourse={notReady}
        onReview={() => router.push(`/trips/${tripId}/visits`)}
        onExpense={() => router.push(`/trips/${tripId}/expenses`)}
        // 지도 핀 고치기 화면은 아직 없다
        onMovePin={notReady}
        onDelete={() => setDeleteOpen(true)}
        onPublish={() => setConfirming(true)}
        onVisibility={() =>
          feed.feed &&
          router.push({ pathname: '/feeds/[feedId]/visibility', params: { feedId: feed.feed.id } })
        }
        onDeleteFeed={() => setFeedDeleteOpen(true)}
      />
      <PublishSheet
        visible={confirming}
        tripTitle={trip.title}
        memberCount={trip.members.length}
        publishing={feed.publishing}
        onClose={() => setConfirming(false)}
        onPreview={() => router.push('/visible-to')}
        onPublish={() => feed.publish(() => setConfirming(false))}
      />
      <DeleteFeedSheet
        visible={feedDeleteOpen}
        tripTitle={trip.title}
        loading={feed.deleting}
        onClose={() => setFeedDeleteOpen(false)}
        onConfirm={(choice) => {
          if (choice === 'feed') {
            feed.remove(() => setFeedDeleteOpen(false));
            return;
          }
          // "기록까지 삭제"가 어떤 API인지 아직 정해지지 않았다(S39 문서 백엔드에 필요한 것 1)
          setFeedDeleteOpen(false);
          notReady();
        }}
      />
      <DeleteRecordSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        // 기록 삭제 API가 아직 없다. 생기면 지운 뒤 S37로 간다
        onConfirm={() => {
          setDeleteOpen(false);
          notReady();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
