import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, CenterNotice, Header, toast } from '@/components/ui';
import { PublishSheet } from '@/features/my-trips/components/publish-sheet';
import { TripRecordView, type RecordFeed } from '@/features/my-trips/components/trip-record-view';
import { publishedVisibility } from '@/features/my-trips/record-rules';
import { colors, layout, spacing } from '@/theme';

/**
 * 개발용 S38 상태 보기. 서버 없이 예시 데이터로 그린다.
 * 앱 흐름에는 안 나오고 /dev/record로만 들어온다. '게시 전'에서 [공동 피드 게시] → [게시]를 누르면 '게시됨'으로 바뀐다
 */

type Example = 'draft' | 'published' | 'error';

const PUBLISHED: RecordFeed = {
  status: 'published',
  visibility: publishedVisibility(['하늘']),
  hiddenNote: '하늘님은 서연님 피드에서는 볼 수 있어요',
};

export default function RecordStates() {
  const [view, setView] = useState<Example | null>(null);
  const [confirming, setConfirming] = useState(false);
  const back = () => setView(null);
  const ready = () => toast.show('준비 중이에요');

  if (view === 'error') {
    return (
      <View style={styles.screen}>
        <Header onBack={back} />
        <CenterNotice
          icon="alert"
          title="여행 기록을 불러오지 못했어요"
          description="불러오지 못했어요. 다시 시도해 주세요."
          actionLabel="다시 시도"
          actionIcon="refresh"
          onAction={back}
          secondaryLabel="돌아가기"
          onSecondary={back}
        />
      </View>
    );
  }

  if (view) {
    return (
      <>
        <TripRecordView
          tripTitle="겨울 여행"
          period="11.14 – 11.15 · 1박 2일"
          companions="서연, 민준과 함께"
          feed={view === 'published' ? PUBLISHED : { status: 'draft' }}
          photos={{
            title: '사진 32장',
            sub: '3명이 올렸어요',
            thumbAssetIds: ['a1', 'a2', 'a3', 'a4'],
          }}
          course={{ value: '4곳 다녀옴', sub: '계획 5곳' }}
          review={{ value: '내 평가 1개', sub: '해운대 4점' }}
          expense={{ value: '23.4만 원', sub: '정산 계산됨' }}
          onBack={back}
          onPhotos={ready}
          onCourse={ready}
          onReview={ready}
          onExpense={ready}
          onMovePin={ready}
          onDelete={ready}
          onPublish={() => setConfirming(true)}
          onVisibility={ready}
          onDeleteFeed={() => setView('draft')}
        />
        <PublishSheet
          visible={confirming}
          tripTitle="겨울 여행"
          memberCount={3}
          onClose={() => setConfirming(false)}
          onPreview={ready}
          onPublish={() => {
            setConfirming(false);
            setView('published');
            toast.show('공동 피드를 게시했어요');
          }}
        />
      </>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.menu} style={styles.screen}>
      <View style={styles.row}>
        <Button label="게시 전" variant="neutral" onPress={() => setView('draft')} />
        <Button label="게시됨" variant="neutral" onPress={() => setView('published')} />
        <Button label="불러오기 실패" variant="neutral" onPress={() => setView('error')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
