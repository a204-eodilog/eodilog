import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CenterNotice, Header, toast } from '@/components/ui';
import { formatTripNights } from '@/lib/format-date';
import { colors } from '@/theme';

import { DeleteRecordSheet } from '../components/delete-record-sheet';
import { PublishSheet } from '../components/publish-sheet';
import { TripRecordView } from '../components/trip-record-view';
import { useTripRecord } from '../hooks/use-trip-record';
import { companionNames, formatPeriod } from '../my-trip-rules';
import { companionLine, courseSummary, expenseSummary, reviewSummary } from '../record-rules';

const notReady = () => toast.show('준비 중이에요');

/**
 * S38 내 여행 기록. N4 여행 줄에서 연다.
 * 코스·평가·경비 요약은 지금 있는 API로 채운다. 공동 피드(게시·노출 설정·삭제), 사진, 기록 삭제,
 * 지도 핀 API가 아직 없어서 늘 "게시 전"으로 그리고 그 버튼들은 준비 중 안내를 띄운다.
 * 게시 확인·기록 삭제 확인(S50) 시트는 열 수 있지만 [게시]·[지우기]도 준비 중 안내다
 */
export function MyTripRecordScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const record = useTripRecord(tripId);
  const [confirming, setConfirming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  return (
    <>
      <TripRecordView
        tripTitle={trip.title}
        period={period && nights ? `${period} · ${nights}` : period}
        companions={companionLine(companionNames(trip, record.myUserId))}
        feed={{ status: 'draft' }}
        course={courseSummary(record.items, record.visits)}
        review={reviewSummary(record.items, record.visits)}
        expense={expenseSummary(record.expenses, record.settlement)}
        // S31 사진 목록, S24 코스 화면은 아직 없다
        onPhotos={notReady}
        onCourse={notReady}
        onReview={() => router.push({ pathname: '/trips/[tripId]/visits', params: { tripId } })}
        onExpense={() => router.push(`/trips/${tripId}/expenses`)}
        // 지도 핀 고치기 화면은 아직 없다
        onMovePin={notReady}
        onDelete={() => setDeleteOpen(true)}
        onPublish={() => setConfirming(true)}
        onVisibility={notReady}
        onDeleteFeed={notReady}
      />
      <PublishSheet
        visible={confirming}
        tripTitle={trip.title}
        memberCount={trip.members.length}
        onClose={() => setConfirming(false)}
        // S40 미리 보기(A)와 공동 피드 게시 API는 아직 없다
        onPreview={notReady}
        onPublish={() => {
          setConfirming(false);
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
