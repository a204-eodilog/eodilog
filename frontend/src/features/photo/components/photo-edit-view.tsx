import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorState, Header, Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { TOPICS } from '../photo-list-rules';
import type { PhotoTopic, TripPhoto } from '../types';
import { TripPhotoTile } from './trip-photo-tile';

const COLUMNS = 3;
const GAP = spacing[10];

export type PhotoEditViewProps = {
  state: 'loading' | 'error' | 'ready';
  tripTitle: string | null;
  placeName: string | null;
  /** 바꾼 값을 얹은 이 장소의 사진 */
  photos: TripPhoto[];
  selected: ReadonlySet<string>;
  /** 고른 사진의 같은 주제(없으면 null) */
  topic: PhotoTopic | null;
  /** 고른 사진의 장소 이름(다르면 "여러 장소") */
  selectedPlaceName: string | null;
  changed: number;
  saving: boolean;
  memberName: (memberId: string) => string;
  myMemberId: string | null;
  onBack: () => void;
  onDone: () => void;
  onToggle: (photoId: string) => void;
  onTopic: (topic: PhotoTopic) => void;
  onChangePlace: () => void;
  onDelete: () => void;
  onRetry: () => void;
};

/**
 * S32 사진 수정(WD-FR-20). 백엔드에 비슷한 사진 묶음이 없어 S31의 장소별 묶음을 고친다.
 * 내 사진을 골라 주제·장소를 바꾸고 [완료]로 저장하거나 [삭제](S50 확인)한다.
 * 묶음에서 빼기·대표 사진·여행 바꾸기는 서버가 지원하지 않아 없다
 */
export function PhotoEditView(props: PhotoEditViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = Math.floor(
    (Math.min(width, 480) - layout.screenPaddingX * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
  );
  const header = (
    <Header
      title="사진 수정"
      subtitle={props.tripTitle ?? undefined}
      onBack={props.onBack}
      right={
        props.state === 'ready' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="완료"
            accessibilityState={{ disabled: props.saving }}
            disabled={props.saving}
            hitSlop={8}
            onPress={props.onDone}
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}
          >
            {props.saving ? (
              <Spinner color={colors.brand.primaryDark} />
            ) : (
              <Icon name="check" size={24} color={colors.brand.primaryDark} />
            )}
          </Pressable>
        ) : undefined
      }
    />
  );

  if (props.state !== 'ready') {
    return (
      <View style={styles.screen}>
        {header}
        {props.state === 'error' ? (
          <ErrorState title="사진을 불러오지 못했어요" onRetry={props.onRetry} />
        ) : (
          <Spinner style={styles.flex} color={colors.brand.primary} />
        )}
      </View>
    );
  }

  const count = props.selected.size;
  const othersCount = props.photos.filter((p) => p.uploaderMemberId !== props.myMemberId).length;
  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={[typography.title3, styles.text]} numberOfLines={1}>
              {props.placeName ?? '장소'} 사진 {props.photos.length}장
            </Text>
            <Text style={[typography.caption, styles.sub]}>
              {othersCount > 0 ? '내가 올린 사진만 고칠 수 있어요' : '바꿀 사진을 골라 주세요'}
            </Text>
          </View>
          <Text style={[typography.captionMedium, styles.link]}>{count}장 선택</Text>
        </View>

        <View style={styles.grid}>
          {props.photos.map((photo, i) => {
            const mine = photo.uploaderMemberId === props.myMemberId;
            return (
              <TripPhotoTile
                key={photo.id}
                assetId={photo.assetId}
                width={tile}
                height={tile - 7}
                uploader={props.memberName(photo.uploaderMemberId)}
                mine={mine}
                selected={props.selected.has(photo.id)}
                disabled={!mine}
                label={`사진 ${i + 1}`}
                onPress={() => props.onToggle(photo.id)}
              />
            );
          })}
        </View>

        {count > 0 ? (
          <View style={styles.box}>
            <Text style={[typography.captionMedium, styles.link]}>고른 {count}장 바꾸기</Text>
            <View style={styles.boxRow}>
              <Label icon="bookmark" text="주제" />
              <View style={styles.topicChips}>
                {TOPICS.map((t) => {
                  const on = props.topic === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`주제 ${t.label}`}
                      onPress={() => props.onTopic(t.key)}
                      style={({ pressed }) => [
                        styles.chip,
                        on && styles.chipOn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[typography.captionMedium, on ? styles.link : styles.sub]}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.boxRow}>
              <Label icon="map-pin" text="장소" />
              <Text style={[typography.body, styles.text, styles.flex]} numberOfLines={1}>
                {props.selectedPlaceName ?? '없음'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="장소 바꾸기"
                // 보이는 높이는 32, 누르는 자리는 위아래 6씩 넓혀 44
                hitSlop={6}
                onPress={props.onChangePlace}
                style={({ pressed }) => [styles.whitePill, pressed && styles.pressed]}
              >
                <Icon name="pencil" size={16} color={colors.text.default} />
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.inline}>
          <Icon name="info" size={16} color={colors.text.icon} />
          <Text style={[typography.caption, styles.sub]}>
            {props.changed > 0
              ? `${props.changed}장을 바꿨어요. [완료]를 눌러야 저장돼요`
              : '바꾼 뒤 [완료]를 눌러 저장해요'}
          </Text>
        </View>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom + spacing[12], 34) }]}>
        <Button
          label={count > 0 ? `${count}장 삭제` : '삭제'}
          variant="danger"
          size="lg"
          disabled={count === 0 || props.saving}
          leading={<Icon name="trash" size={20} color={colors.text.inverse} />}
          onPress={props.onDelete}
        />
      </View>
    </View>
  );
}

function Label({ icon, text }: { icon: 'bookmark' | 'map-pin'; text: string }) {
  return (
    <View style={[styles.inline, styles.label]}>
      <Icon name={icon} size={16} color={colors.text.icon} />
      <Text style={[typography.captionMedium, styles.sub]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  link: { color: colors.brand.primaryDark },
  pressed: { opacity: 0.6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  done: { minWidth: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  body: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
    gap: spacing[14],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  // 고른 사진 바꾸기 상자: 둥글기 20, 안쪽 16/20, 줄 간격 8, 줄 높이 40
  box: {
    backgroundColor: colors.surface.default,
    borderRadius: radius.xl,
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[20],
    gap: spacing[8],
  },
  boxRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  label: { width: 64 },
  topicChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing[6] },
  chip: {
    height: 32,
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.brand.primaryLight },
  whitePill: {
    height: 32,
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    justifyContent: 'center',
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
});
