import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { UserCard } from '@/api/types';
import { Avatar, EmptyState, ErrorState, Header, Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { followButtonState, suggestionReason } from '../people-rules';
import type { FriendSuggestion } from '../types';

import { FollowButton } from './follow-button';

export type FindFriendsViewProps = {
  suggestions: { state: 'loading' | 'error' | 'ready'; items: readonly FriendSuggestion[] };
  /** 검색어를 넣고 [찾기]를 눌렀을 때. null이면 추천 보기 */
  search: {
    query: string;
    state: 'loading' | 'error' | 'ready';
    items: readonly UserCard[];
  } | null;
  pendingUserId: string | null;
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  onFollow: (user: UserCard) => void;
  onHide: (user: UserCard) => void;
  onPerson: (user: UserCard) => void;
  onRetry: () => void;
};

/** S44 친구 추천·검색(WD-FR-03, 02). 추천 후보와 공개 가능한 이유, 숨기기, 닉네임 검색 */
export function FindFriendsView(props: FindFriendsViewProps) {
  const [text, setText] = useState(props.search?.query ?? '');
  const submit = () => {
    const q = text.trim();
    if (q) props.onSearch(q);
    else props.onClearSearch();
  };
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header title="친구 찾기" />
      <View style={styles.searchBox}>
        <Icon name="search" size={20} color={colors.text.icon} />
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (!v.trim()) props.onClearSearch();
          }}
          placeholder="닉네임"
          placeholderTextColor={colors.text.sub}
          returnKeyType="search"
          onSubmitEditing={submit}
          maxLength={20}
          style={styles.searchInput}
          accessibilityLabel="닉네임으로 찾기"
        />
        <Pressable
          onPress={submit}
          style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.searchButtonText}>찾기</Text>
        </Pressable>
      </View>

      {props.search ? (
        <SearchResults {...props} search={props.search} />
      ) : (
        <Suggestions {...props} />
      )}
    </SafeAreaView>
  );
}

function Suggestions(props: FindFriendsViewProps) {
  const { state, items } = props.suggestions;
  if (state === 'error')
    return <ErrorState title="추천을 불러오지 못했어요" onRetry={props.onRetry} />;
  if (state === 'loading')
    return <ActivityIndicator style={styles.flex} color={colors.brand.primary} />;
  if (items.length === 0) {
    return (
      <EmptyState title="아직 추천할 친구가 없어요" description="닉네임으로 찾아 팔로우해 보세요" />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.sectionTitle}>추천 친구</Text>
      {items.map((s) => (
        <View key={s.user.id} style={styles.card}>
          <Pressable
            onPress={() => props.onPerson(s.user)}
            style={styles.cardHead}
            accessibilityRole="button"
            accessibilityLabel={`${s.user.nickname}, ${suggestionReason(s.reason)}`}
          >
            <Avatar name={s.user.nickname} imageUrl={s.user.profileImageUrl} size={44} />
            <View style={styles.cardText}>
              <Text style={styles.name}>{s.user.nickname}</Text>
              <View style={styles.reason}>
                <Icon
                  name={s.reason.kind === 'CO_TRAVELER' ? 'image' : 'heart'}
                  size={14}
                  color={colors.text.icon}
                />
                <Text style={styles.reasonText}>{suggestionReason(s.reason)}</Text>
              </View>
            </View>
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              onPress={() => props.onHide(s.user)}
              style={({ pressed }) => [styles.hide, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${s.user.nickname} 추천 숨기기`}
            >
              <Icon name="eye-off" size={18} color={colors.text.strong} />
              <Text style={styles.hideText}>숨기기</Text>
            </Pressable>
            <FollowButton
              compact
              onCard
              state={followButtonState(s.user)}
              loading={props.pendingUserId === s.user.id}
              onPress={() => props.onFollow(s.user)}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function SearchResults(
  props: FindFriendsViewProps & { search: NonNullable<FindFriendsViewProps['search']> },
) {
  const { state, items, query } = props.search;
  if (state === 'error')
    return <ErrorState title="찾지 못했어요" onRetry={() => props.onSearch(query)} />;
  if (state === 'loading')
    return <ActivityIndicator style={styles.flex} color={colors.brand.primary} />;
  if (items.length === 0) {
    return (
      <EmptyState
        title={`'${query}' 닉네임을 찾지 못했어요`}
        description="닉네임을 정확히 입력했는지 확인해 주세요"
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.sectionTitle}>검색 결과</Text>
      {items.map((u) => (
        <View key={u.id} style={styles.row}>
          <Pressable
            onPress={() => props.onPerson(u)}
            style={styles.rowMain}
            accessibilityRole="button"
            accessibilityLabel={u.nickname}
          >
            <Avatar name={u.nickname} imageUrl={u.profileImageUrl} size="lg" />
            <View style={styles.cardText}>
              <Text style={styles.name}>{u.nickname}</Text>
              {u.accountVisibility === 'PRIVATE' ? (
                <View style={styles.reason}>
                  <Icon name="lock" size={12} color={colors.text.muted} />
                  <Text style={styles.reasonText}>비공개 계정</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
          <FollowButton
            compact
            state={followButtonState(u)}
            loading={props.pendingUserId === u.id}
            onPress={() => props.onFollow(u)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    height: 48,
    marginHorizontal: layout.screenPaddingX,
    marginTop: spacing[8],
    paddingLeft: spacing[16],
    paddingRight: spacing[6],
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.text.default,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  searchButton: {
    height: 36,
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    justifyContent: 'center',
  },
  searchButtonText: { ...typography.captionBold, color: colors.text.default },
  list: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[24],
    paddingBottom: spacing[32],
    gap: spacing[12],
  },
  sectionTitle: { ...typography.title3, color: colors.text.default, marginBottom: spacing[2] },
  card: {
    padding: spacing[20],
    gap: spacing[12],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  cardText: { flex: 1, minWidth: 0, gap: spacing[6] },
  name: { ...typography.bodyBold, color: colors.text.default },
  reason: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[6] },
  reasonText: { ...typography.caption, color: colors.text.sub },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[12],
  },
  hide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 40,
    paddingHorizontal: spacing[8],
  },
  hideText: { ...typography.bodyMedium, color: colors.text.strong },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingVertical: spacing[10],
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
});
