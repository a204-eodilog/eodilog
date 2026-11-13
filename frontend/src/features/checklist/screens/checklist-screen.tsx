import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FadeIn } from '@/components/ui/fade-in';
import { Spinner } from '@/components/ui/spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorLook } from '@/api/error-look';
import { toApiError } from '@/api/errors';
import { AvatarGroup, ErrorState, Header, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { useTrip } from '@/features/trip/hooks/use-trip';
import { useMe } from '@/hooks/use-me';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { AddItemBar } from '../components/add-item-bar';
import { ChecklistEmpty } from '../components/checklist-empty';
import { ChecklistProgress } from '../components/checklist-progress';
import { ChecklistRow } from '../components/checklist-row';
import { SuggestFailCard } from '../components/suggest-fail-card';
import { CHECKLIST_TEXT } from '../checklist-rules';
import { EditItemSheet } from '../components/edit-item-sheet';
import { useChecklist } from '../hooks/use-checklist';
import { useItemMutations } from '../hooks/use-item-mutations';
import { useSuggestChecklist, type SuggestFailure } from '../hooks/use-suggest-checklist';
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
  /** 불러오기 실패의 원인. 아이콘과 짧은 제목을 고른다 */
  error?: unknown;
  onToggle(item: ChecklistItem): void;
  onMore(item: ChecklistItem): void;
  onAdd(label: string): Promise<boolean>;
  adding: boolean;
  /** 고치기 시트로 연 항목. null이면 닫힘 */
  editing: ChecklistItem | null;
  onCloseEdit(): void;
  onSave(item: ChecklistItem, label: string): Promise<boolean>;
  onDelete(item: ChecklistItem): void;
  onSuggest(): void;
  suggesting: boolean;
  /** 다시 제안 실패. null이면 카드를 숨긴다 */
  failure: SuggestFailure | null;
  /** 실패 카드 버튼. 일반 실패는 다시 요청, 추천 꺼짐은 설정 열기 */
  onFailAction(): void;
  /** 미리보기용. 빈 상태에서 [직접 추가]를 누른 모습으로 시작한다 */
  initialAddOpen?: boolean;
};

/** S27 준비물 체크리스트 모습. 데이터는 ChecklistScreen이나 미리보기가 넘긴다 */
export function ChecklistView(props: ChecklistViewProps) {
  const { tripTitle, people, status, items } = props;
  const members = people.map((p) => ({ id: p.id, name: p.name }));
  // 빈 상태에서 [직접 추가]를 누르면 안내 아래에 입력이 나타난다(가정 Q-5-4)
  const [addOpen, setAddOpen] = useState(props.initialAddOpen ?? false);
  const insets = useSafeAreaInsets();
  const failCard = props.failure ? (
    <SuggestFailCard failure={props.failure} onAction={props.onFailAction} />
  ) : null;

  let body;
  if (status === 'loading') {
    body = <SkeletonList style={styles.loading} />;
  } else if (status === 'notFound') {
    body = (
      <ErrorState
        icon="lock"
        title="볼 수 없어요"
        description={null}
        retryLabel="돌아가기"
        onRetry={() => router.back()}
      />
    );
  } else if (status === 'error') {
    body = <ErrorState {...errorLook(props.error)} description={null} onRetry={props.onRetry} />;
  } else if (items.length === 0) {
    body = (
      <ScrollView contentContainerStyle={styles.emptyScroll} keyboardShouldPersistTaps="handled">
        {/* 실패 카드는 목록 상태처럼 위에 두고, 안내 묶음만 남은 공간 가운데에 둔다 */}
        {failCard ? <View style={styles.emptyCard}>{failCard}</View> : null}
        <View style={styles.empty}>
          <ChecklistEmpty
            onSuggest={props.onSuggest}
            suggesting={props.suggesting}
            onAddDirect={() => setAddOpen(true)}
          />
          {addOpen ? (
            <View style={styles.emptyAdd}>
              <AddItemBar onAdd={props.onAdd} busy={props.adding} autoFocus />
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  } else {
    body = (
      <>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {failCard}
          <ChecklistProgress items={items} />
          <View style={styles.list}>
            {items.map((item, order) => (
              <FadeIn key={item.id} index={order}>
                <ChecklistRow
                  item={item}
                  members={members}
                  onToggle={props.onToggle}
                  onMore={props.onMore}
                />
              </FadeIn>
            ))}
          </View>
          <AddItemBar onAdd={props.onAdd} busy={props.adding} />
        </ScrollView>
        <View
          style={[
            styles.bottom,
            { paddingBottom: Math.max(insets.bottom, spacing[16]) },
            props.failure && styles.bottomWithNote,
          ]}
        >
          {props.failure ? (
            <View style={styles.note}>
              <Icon name="pencil" size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.noteText]}>{CHECKLIST_TEXT.keepEdited}</Text>
            </View>
          ) : null}
          <PressableScale
            accessibilityLabel={props.suggesting ? '제안 받는 중…' : '다시 제안 받기'}
            style={[styles.suggest, !props.failure && styles.suggestBlock]}
            onPress={props.onSuggest}
            disabled={props.suggesting}
            accessibilityRole="button"
            accessibilityState={{ disabled: props.suggesting, busy: props.suggesting }}
          >
            {props.suggesting ? (
              <Spinner size="small" color={colors.text.icon} />
            ) : (
              <Icon name="refresh" size={20} color={colors.text.default} />
            )}
          </PressableScale>
        </View>
      </>
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
      <KeyboardAvoidingView
        style={styles.flex}
        // 안드로이드도 화면 끝까지 그리는 모드라 채팅처럼 키보드만큼 직접 띄운다
        behavior="padding"
      >
        {body}
      </KeyboardAvoidingView>
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
  const suggest = useSuggestChecklist(tripId);
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
      error={checklist.error ?? trip.error}
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
      onSuggest={() => void suggest.start()}
      suggesting={suggest.suggesting}
      failure={suggest.failure}
      onFailAction={() =>
        suggest.failure === 'disabled' ? router.push('/settings') : void suggest.start()
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  // 로딩 동그라미를 남은 화면의 정중앙에 둔다
  loading: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
    gap: spacing[20],
  },
  list: { gap: spacing[10] },
  // 디자인은 아래 110을 비워 안내를 화면 가운데보다 조금 위에 둔다
  emptyScroll: { flexGrow: 1 },
  empty: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: spacing[16],
    paddingBottom: 110,
  },
  emptyAdd: { paddingHorizontal: layout.screenPaddingX, marginTop: spacing[24] },
  emptyCard: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16] },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    backgroundColor: colors.surface.white,
  },
  bottomWithNote: { justifyContent: 'space-between', gap: spacing[12] },
  note: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing[8] },
  noteText: { color: colors.text.icon, flexShrink: 1 },
  suggest: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[10],
    height: 48,
    paddingLeft: spacing[20],
    paddingRight: spacing[24],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  suggestBlock: { flex: 1 },
  suggestText: { color: colors.text.default },
});
