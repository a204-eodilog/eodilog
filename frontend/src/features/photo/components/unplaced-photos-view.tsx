import { FlashList } from '@shopify/flash-list';
import { SCROLL_DECELERATION } from '@/theme/scroll';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarGroup, Button, ErrorState, Header } from '@/components/ui';
import { SkeletonList } from '@/components/ui/skeleton';
import { colors, layout, spacing, typography } from '@/theme';

import type { TripPhoto } from '../types';
import { type CourseDay, CoursePlaceList } from './course-place-list';
import { TripPhotoTile } from './trip-photo-tile';

const COLUMNS = 4;
const GAP = spacing[8];
/**
 * 화면 밖으로 미리 그려 둘 거리. 목록 기본값(250)이면 사진 100장 화면에서 보이는 22장 말고도 30장을 더 받는다.
 * 사진은 한 장이 1MB쯤이라 미리 받는 양을 줄인다. 받는 동안은 칸의 회색 바탕이 보인다
 */
const DRAW_DISTANCE = 100;

export type UnplacedPhotosViewProps = {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  tripTitle: string | null;
  photos: TripPhoto[];
  /** 고른 사진 id. 내 사진만 고를 수 있다 */
  selected: ReadonlySet<string>;
  days: CourseDay[];
  courseState: 'loading' | 'error' | 'ready';
  placeId: string | null;
  /** S13에서 고른 코스 밖 장소 */
  searched: { id: string; name: string } | null;
  saving: boolean;
  memberName: (memberId: string) => string;
  myMemberId: string | null;
  /** 상단 바 오른쪽 동행 얼굴 묶음 24(참여 순) */
  members: { name: string; imageUrl: string | null; me: boolean }[];
  onBack: () => void;
  onToggle: (photoId: string) => void;
  onPlace: (placeId: string) => void;
  onSearch: () => void;
  onConnect: () => void;
};

/**
 * S31 장소 미지정 묶음(별도 화면). 연결할 사진을 고르고(기본 모두, 내 사진만) 코스 장소 하나를 골라 [연결하기].
 * 코스에 없는 곳은 아래 장소 검색 줄(S13)로 찾아 고른다
 */
export function UnplacedPhotosView(props: UnplacedPhotosViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = Math.floor(
    (Math.min(width, 480) - layout.screenPaddingX * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
  );
  const othersCount = props.photos.filter((p) => p.uploaderMemberId !== props.myMemberId).length;
  const canConnect = props.selected.size > 0 && !!props.placeId && !props.saving;
  const header = (
    <Header
      title="장소 미지정"
      subtitle={props.tripTitle ?? undefined}
      onBack={props.onBack}
      right={props.members.length > 0 ? <AvatarGroup people={props.members} /> : undefined}
    />
  );

  if (props.state !== 'ready') {
    return (
      <View style={styles.screen}>
        {header}
        {props.state === 'error' ? (
          <ErrorState title="사진을 불러오지 못했어요" onRetry={props.onRetry} />
        ) : (
          <SkeletonList style={styles.flex} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      {/* 사진이 많아도 화면에 보이는 줄만 만들고 받는다(예전에는 모든 사진을 한 번에 그렸다) */}
      <FlashList
        data={props.photos}
        keyExtractor={(photo) => photo.id}
        numColumns={COLUMNS}
        extraData={props.selected}
        decelerationRate={SCROLL_DECELERATION}
        drawDistance={DRAW_DISTANCE}
        contentContainerStyle={styles.body}
        ListHeaderComponent={
          <View style={styles.listHead}>
            <Text style={[typography.caption, styles.hint]}>
              어디서 찍었는지 모르는 사진을 장소에 연결해요
              {othersCount > 0
                ? `. 동행이 올린 ${othersCount}장은 올린 사람만 연결할 수 있어요`
                : ''}
            </Text>
            <View style={styles.head}>
              <Text style={[typography.title3, styles.text]}>사진 {props.photos.length}장</Text>
              <Text style={[typography.caption, styles.sub]}>{props.selected.size}장 선택</Text>
            </View>
          </View>
        }
        renderItem={({ item: photo, index }) => {
          const mine = photo.uploaderMemberId === props.myMemberId;
          return (
            // 목록은 칸을 같은 너비로 나눈다. 열마다 조금씩 밀어 사진 사이 간격을 GAP으로 맞춘다
            <View style={{ paddingLeft: ((index % COLUMNS) * GAP) / COLUMNS, paddingBottom: GAP }}>
              <TripPhotoTile
                assetId={photo.assetId}
                width={tile}
                height={tile + 6}
                uploader={props.memberName(photo.uploaderMemberId)}
                mine={mine}
                selected={props.selected.has(photo.id)}
                disabled={!mine}
                label={`사진 ${index + 1}`}
                onPress={() => props.onToggle(photo.id)}
              />
            </View>
          );
        }}
        ListFooterComponent={
          <View style={[styles.block, styles.listFoot]}>
            <View style={styles.head}>
              <Text style={[typography.title3, styles.text]}>어디서 찍었나요?</Text>
              <Text style={[typography.caption, styles.sub]}>코스 장소</Text>
            </View>
            <CoursePlaceList
              days={props.days}
              state={props.courseState}
              placeId={props.placeId}
              onPlace={props.onPlace}
              picked={props.searched}
              onSearch={props.onSearch}
            />
          </View>
        }
      />
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom + spacing[12], 34) }]}>
        <Button
          label="연결하기"
          icon="link"
          size="lg"
          disabled={!canConnect}
          loading={props.saving}
          onPress={props.onConnect}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  hint: { color: colors.text.sub2 },
  pressed: { opacity: 0.6 },
  body: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
  },
  // 안내 글 → 사진 수 줄 14, 사진 수 줄 → 사진 12
  listHead: { gap: spacing[14], paddingBottom: spacing[12] },
  // 마지막 사진 줄 아래에 이미 GAP만큼 떨어져 있다
  listFoot: { paddingTop: spacing[14] - GAP },
  block: { gap: spacing[12] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
});
