import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { AvatarGroup, ErrorState, Header } from '@/components/ui';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';
import { colors, layout, spacing } from '@/theme';

import { AddItemBar } from '../components/add-item-bar';
import { ChecklistProgress } from '../components/checklist-progress';
import { ChecklistRow } from '../components/checklist-row';
import { EditItemSheet } from '../components/edit-item-sheet';
import { useChecklist } from '../hooks/use-checklist';
import { useItemMutations } from '../hooks/use-item-mutations';
import { useToggleCheck } from '../hooks/use-toggle-check';
import type { ChecklistItem } from '../types';

type Person = { id: string; name: string; imageUrl: string | null; me: boolean };

export type ChecklistViewProps = {
  tripTitle?: string;
  /** 참여 중인 동행. 머리 얼굴과 챙긴 사람 이름에 쓴다 */
  people: Person[];
  status: 'loading' | 'error' | 'notFound' | 'ready';
  items: ChecklistItem[];
  onRetry(): void;
  onToggle(item: ChecklistItem): void;
  onMore(item: ChecklistItem): void;
  onAdd(label: string): Promise<boolean>;
  adding: boolean;
  /** 고치기 시트로 연 항목. null이면 닫힘 */
  editing: ChecklistItem | null;
  onCloseEdit(): void;
  onSave(item: ChecklistItem, label: string): Promise<boolean>;
  onDelete(item: ChecklistItem): void;
};

/** S27 준비물 체크리스트 모습. 데이터는 ChecklistScreen이나 미리보기가 넘긴다 */
export function ChecklistView(props: ChecklistViewProps) {
  const { tripTitle, people, status, items } = props;
  const members = people.map((p) => ({ id: p.id, name: p.name }));

  let body;
  if (status === 'loading') {
    body = <ActivityIndicator style={styles.loading} color={colors.brand.primary} />;
  } else if (status === 'notFound') {
    body = (
      <ErrorState
        title="여행을 찾을 수 없어요"
        description="나갔거나 지워진 여행일 수 있어요"
        retryLabel="돌아가기"
        onRetry={() => router.back()}
      />
    );
  } else if (status === 'error') {
    body = <ErrorState title="준비물을 불러오지 못했어요" onRetry={props.onRetry} />;
  } else {
    body = (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ChecklistProgress items={items} />
        <View style={styles.list}>
          {items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              members={members}
              onToggle={props.onToggle}
              onMore={props.onMore}
            />
          ))}
        </View>
        <AddItemBar onAdd={props.onAdd} busy={props.adding} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="준비물"
        subtitle={tripTitle}
        subtitleIcon="trip"
        right={
          people.length > 0 ? (
            <AvatarGroup
              people={people.map((p) => ({ name: p.name, imageUrl: p.imageUrl, me: p.me }))}
              max={3}
            />
          ) : undefined
        }
      />
      {body}
      <EditItemSheet
        item={props.editing}
        onClose={props.onCloseEdit}
        onSave={props.onSave}
        onDelete={props.onDelete}
      />
    </View>
  );
}

/** S27 준비물 체크리스트. 여행 상세의 '여행 중' 메뉴에서 연다(S25가 생길 때까지 임시, 가정 Q-5-5) */
export function ChecklistScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const me = useMe();
  const checklist = useChecklist(tripId);

  const people: Person[] = (trip.data?.members ?? [])
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      id: m.id,
      name: m.user.nickname,
      imageUrl: m.user.profileImageUrl,
      me: m.user.id === me.data?.id,
    }));
  const myMemberId = people.find((p) => p.me)?.id ?? null;
  const toggle = useToggleCheck(tripId, myMemberId);
  const mutations = useItemMutations(tripId);
  const [editingId, setEditingId] = useState<string | null>(null);
  // 시트를 연 사이 다른 동행이 지워 목록에서 빠지면 시트도 닫힌다
  const editing = checklist.data?.find((i) => i.id === editingId) ?? null;

  const notFound =
    toApiError(checklist.error).status === 404 || toApiError(trip.error).status === 404;
  const status = notFound
    ? 'notFound'
    : checklist.data
      ? 'ready'
      : checklist.isError
        ? 'error'
        : 'loading';

  return (
    <ChecklistView
      tripTitle={trip.data?.title}
      people={people}
      status={status}
      items={checklist.data ?? []}
      onRetry={() => void checklist.refetch()}
      onToggle={toggle}
      onMore={(item) => setEditingId(item.id)}
      onAdd={mutations.add}
      adding={mutations.isAdding}
      editing={editing}
      onCloseEdit={() => setEditingId(null)}
      onSave={mutations.rename}
      onDelete={(item) => void mutations.remove(item)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { marginTop: spacing[32] },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
    gap: spacing[20],
  },
  list: { gap: spacing[10] },
});
