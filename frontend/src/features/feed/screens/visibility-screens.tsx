import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { UserCard } from '@/api/types';
import { toast } from '@/components/ui';

import { DeleteFeedSheet } from '../components/delete-feed-sheet';
import { VisibilityView } from '../components/visibility-view';
import { useVisibility } from '../hooks/use-visibility';
import { viewerRows } from '../visibility';

/** S39 내 노출 설정 /feeds/[feedId]/visibility. S38 내 여행 기록에서 들어온다 */
export function VisibilityScreen() {
  const { feedId } = useLocalSearchParams<{ feedId: string }>();
  const v = useVisibility(feedId ?? '');
  return (
    <VisibilityView
      state={v.state}
      tripTitle={v.tripTitle}
      rows={v.rows}
      changed={v.changed}
      saving={v.saving}
      onToggle={v.toggle}
      onSave={v.save}
      onRetry={v.retry}
    />
  );
}

const person = (id: string, nickname: string): UserCard => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'ACCEPTED',
  followedByStatus: 'ACCEPTED',
});
const FOLLOWERS = [person('u1', '하늘'), person('u4', '바다'), person('u5', '다온')];
const COMPANIONS = [person('u2', '가람'), person('u3', '나래')];

type PreviewState = 'basic' | 'delete' | 'loading' | 'error';

/** /dev/visibility?state=basic|delete|loading|error. Figma S39(숨긴 친구 1, 동행 2, 보여 주는 친구 2) */
export function VisibilityPreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: PreviewState }>();
  const [hidden, setHidden] = useState(() => new Set(['u1']));
  const [sheet, setSheet] = useState(state === 'delete');
  if (!__DEV__) return <Redirect href="/" />;
  const rows = viewerRows({ meId: 'me', followers: FOLLOWERS, companions: COMPANIONS, hidden });
  return (
    <>
      <VisibilityView
        state={state === 'loading' || state === 'error' ? state : 'ready'}
        tripTitle="겨울 여행"
        rows={rows}
        changed={!(hidden.size === 1 && hidden.has('u1'))}
        saving={false}
        onToggle={(id) =>
          setHidden((h) => {
            const n = new Set(h);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          })
        }
        onSave={() => toast.show('노출 설정을 저장했어요')}
        onRetry={() => toast.show('다시 불러와요')}
      />
      <DeleteFeedSheet
        visible={sheet}
        tripTitle="겨울 여행"
        onClose={() => setSheet(false)}
        onConfirm={(c) => {
          setSheet(false);
          toast.show(c === 'feed' ? '공동 피드를 삭제했어요' : '기록까지 삭제했어요');
        }}
      />
    </>
  );
}
