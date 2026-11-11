import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { UserCard } from '@/api/types';
import {
  Avatar,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  type IconName,
  KoreaMap,
} from '@/components/ui';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { FriendView, VisibleFeedCard } from '../preview-rules';

import { useTripPinMap } from './mypage-view';

export type FriendPreviewViewProps = {
  state: 'loading' | 'error' | 'no-friends' | 'ready';
  friends: readonly UserCard[];
  selectedId: string | null;
  view?: FriendView;
  onSelect: (userId: string) => void;
  onFeed: (card: VisibleFeedCard) => void;
  onRetry: () => void;
};

const TAG_ICON: Record<string, IconName> = { 사진: 'image', 경로: 'route', 평점: 'star' };

/** S40 친구에게 보이는 모습. 친구를 고르면 그 친구가 보는 내 지도·피드를 미리 본다 */
export function FriendPreviewView(props: FriendPreviewViewProps) {
  const friend = props.friends.find((f) => f.id === props.selectedId);
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header title="친구에게 보이는 모습" />
      {props.state === 'error' ? (
        <ErrorState title="미리 보기를 불러오지 못했어요" onRetry={props.onRetry} />
      ) : props.state === 'loading' ? (
        <Spinner style={styles.flex} color={colors.brand.primary} />
      ) : props.state === 'no-friends' ? (
        <EmptyState
          title="나를 팔로우하는 친구가 없어요"
          description="친구가 팔로우하면 그 친구에게 보이는 모습을 미리 볼 수 있어요"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipsScroll}
          >
            {props.friends.map((f) => {
              const on = f.id === props.selectedId;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => props.onSelect(f.id)}
                  style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Avatar name={f.nickname} imageUrl={f.profileImageUrl} size="md" />
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.nickname}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {friend && props.view ? (
            <>
              <View style={styles.lead}>
                <Icon name="eye" size={18} color={colors.brand.primaryDark} />
                <Text style={styles.leadText}>{friend.nickname}님에게 이렇게 보여요</Text>
              </View>

              <MiniMap view={props.view} />

              {props.view.cards.length === 0 ? (
                <Text style={styles.none}>{friend.nickname}님에게 보이는 공동 피드가 없어요</Text>
              ) : (
                props.view.cards.map((c) => (
                  <FeedCard key={c.id} card={c} onPress={() => props.onFeed(c)} />
                ))
              )}

              {props.view.hiddenCount > 0 ? (
                <View style={styles.hidden}>
                  <View style={styles.hiddenHead}>
                    <Icon name="lock" size={16} color={colors.text.strong} />
                    <Text style={styles.hiddenTitle}>
                      {friend.nickname}님에게 숨긴 여행 {props.view.hiddenCount}개
                    </Text>
                  </View>
                  <Text style={styles.hiddenDesc}>
                    숨긴 여행 {props.view.hiddenCount}개는 동행 피드에서는 보일 수 있어요
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MiniMap({ view }: { view: FriendView }) {
  const map = useTripPinMap(view.pins, () => {});
  return (
    <View style={styles.map} onLayout={map.onLayout}>
      <KoreaMap
        pins={map.pins}
        interactive={false}
        initialFocus={map.focus}
        focus={map.moveTo}
        creditBottom={spacing[6]}
      />
    </View>
  );
}

function FeedCard({ card, onPress }: { card: VisibleFeedCard; onPress: () => void }) {
  const src = assetSource(card.coverUrl);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.cover}>
        <Icon name="image" size={22} color={colors.brand.primary} />
        {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {card.title}
        </Text>
        {card.period ? (
          <View style={styles.meta}>
            <Icon name="calendar" size={14} color={colors.text.icon} />
            <Text style={styles.metaText}>{card.period}</Text>
          </View>
        ) : null}
        {card.tags.length > 0 ? (
          <View style={styles.tags}>
            {card.tags.map((t) => (
              <View key={t} style={styles.meta}>
                <Icon name={TAG_ICON[t] ?? 'info'} size={14} color={colors.text.icon} />
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingBottom: spacing[32], gap: spacing[16] },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: spacing[8], paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[8] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 40,
    paddingLeft: spacing[6],
    paddingRight: spacing[14],
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.brand.primaryLight, borderColor: colors.brand.primaryLight },
  chipOff: { backgroundColor: colors.surface.white, borderColor: colors.line.default },
  chipText: { ...typography.bodyMedium, color: colors.text.strong },
  chipTextOn: { color: colors.brand.primaryDark },
  lead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    paddingHorizontal: layout.screenPaddingX,
  },
  leadText: { ...typography.bodyBold, color: colors.text.default },
  map: {
    height: 250,
    marginHorizontal: layout.screenPaddingX,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
    overflow: 'hidden',
    backgroundColor: colors.map.seaMid,
  },
  none: {
    ...typography.caption,
    color: colors.text.muted,
    textAlign: 'center',
    paddingHorizontal: layout.screenPaddingX,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    marginHorizontal: layout.screenPaddingX,
    padding: spacing[14],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  cover: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0, gap: spacing[6] },
  cardTitle: { ...typography.bodyBold, color: colors.text.default },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  metaText: { ...typography.caption, color: colors.text.sub },
  tags: { flexDirection: 'row', gap: spacing[12] },
  tagText: { ...typography.caption, color: colors.text.strong },
  hidden: {
    marginHorizontal: layout.screenPaddingX,
    padding: spacing[18],
    gap: spacing[8],
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryBg,
  },
  hiddenHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  hiddenTitle: { ...typography.bodyBold, color: colors.text.default },
  hiddenDesc: { ...typography.caption, color: colors.text.sub },
});
