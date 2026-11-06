import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, toast } from '@/components/ui';
import { DeleteReviewSheet } from '@/features/visit/components/delete-review-sheet';
import type { ReviewCardData } from '@/features/visit/components/review-card';
import { ReviewView } from '@/features/visit/components/review-view';
import { canSaveReview } from '@/features/visit/review-rules';
import { colors, layout, spacing } from '@/theme';

/**
 * 개발용 S34 상태 보기. 서버 없이 예시 데이터(값 문서 "예시 데이터")로 그린다.
 * 앱 흐름에는 안 나오고 /dev/review로만 들어온다. 작성에서 [저장]을 누르면 남긴 뒤로,
 * 저장 실패에서는 [다시 저장]을 누르면 성공한다
 */

const PEOPLE = [
  { name: '지우', imageUrl: null, me: true },
  { name: '서연', imageUrl: null, me: false },
  { name: '민준', imageUrl: null, me: false },
];

const COMPANIONS: ReviewCardData[] = [
  {
    id: 'r1',
    name: '서연',
    imageUrl: null,
    score: 5,
    date: '11.15(일)',
    body: '사진 찍기 좋은 곳이에요',
  },
  {
    id: 'r2',
    name: '민준',
    imageUrl: null,
    score: 4,
    date: '11.16(월)',
    body: '사람이 많았지만 바다가 예뻐요',
  },
];

type Example = 'write' | 'done' | 'failure';

export default function ReviewStates() {
  const [view, setView] = useState<Example | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [mine, setMine] = useState<ReviewCardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const open = (kind: Example) => {
    const filled = kind !== 'write';
    setScore(filled ? 4 : null);
    setBody(filled ? '파도 소리 들으며 걷기 좋았어요' : '');
    setMine(kind === 'done' ? card(4, '파도 소리 들으며 걷기 좋았어요') : null);
    setFailed(kind === 'failure');
    setView(kind);
  };

  if (!view) {
    return (
      <ScrollView contentContainerStyle={styles.menu} style={styles.screen}>
        <View style={styles.row}>
          <Button label="작성" variant="neutral" onPress={() => open('write')} />
          <Button label="남긴 뒤" variant="neutral" onPress={() => open('done')} />
          <Button label="저장 실패" variant="neutral" onPress={() => open('failure')} />
        </View>
      </ScrollView>
    );
  }

  const onSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setFailed(false);
      setMine(card(score ?? 1, body));
      toast.success('평가를 남겼어요');
    }, 600);
  };

  return (
    <>
      <ReviewView
        tripTitle="겨울 여행"
        people={PEOPLE}
        placeName="해운대 해변"
        when="1일차 · 11.14(토) 10:00"
        evidence="PHOTO"
        mode={mine ? 'done' : 'write'}
        score={score}
        body={body}
        onScore={setScore}
        onBody={setBody}
        canSave={canSaveReview(score, body)}
        saving={saving}
        saveFailed={failed}
        onSave={onSave}
        myReview={mine}
        companions={COMPANIONS}
        onEdit={() => {
          if (!mine) return;
          setScore(mine.score);
          setBody(mine.body);
          setMine(null);
        }}
        onDelete={() => setDeleting(true)}
        onBack={() => setView(null)}
      />
      <DeleteReviewSheet
        visible={deleting}
        placeName="해운대 해변"
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          setMine(null);
          setScore(null);
          setBody('');
          toast.success('평가를 삭제했어요');
        }}
      />
    </>
  );
}

function card(score: number, body: string): ReviewCardData {
  return { id: 'mine', name: '지우', imageUrl: null, score, date: '11.14(토)', body };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
