import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorState, Header, Icon } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import type { TripPhoto } from '../types';
import { type CourseDay, CoursePlaceList } from './course-place-list';
import { TripPhotoTile } from './trip-photo-tile';

const COLUMNS = 4;
const GAP = spacing[8];

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
  saving: boolean;
  memberName: (memberId: string) => string;
  myMemberId: string | null;
  onBack: () => void;
  onToggle: (photoId: string) => void;
  onPlace: (placeId: string) => void;
  onConnect: () => void;
};

/**
 * S31 장소 미지정 묶음(별도 화면). 연결할 사진을 고르고(기본 모두, 내 사진만) 코스 장소 하나를 골라 [연결하기].
 * 장소 검색 줄(S13)은 장소 기능(A)의 공개 파일이 dev에 들어오면 붙인다
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
    <Header title="장소 미지정" subtitle={props.tripTitle ?? undefined} onBack={props.onBack} />
  );

  if (props.state !== 'ready') {
    return (
      <View style={styles.screen}>
        {header}
        {props.state === 'error' ? (
          <ErrorState title="사진을 불러오지 못했어요" onRetry={props.onRetry} />
        ) : (
          <ActivityIndicator style={styles.flex} color={colors.brand.primary} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[typography.caption, styles.hint]}>
          어디서 찍었는지 모르는 사진을 장소에 연결해요
          {othersCount > 0 ? `. 동행이 올린 ${othersCount}장은 올린 사람만 연결할 수 있어요` : ''}
        </Text>

        <View style={styles.block}>
          <View style={styles.head}>
            <Text style={[typography.title3, styles.text]}>사진 {props.photos.length}장</Text>
            <Text style={[typography.caption, styles.sub]}>{props.selected.size}장 선택</Text>
          </View>
          <View style={styles.grid}>
            {props.photos.map((photo, i) => {
              const mine = photo.uploaderMemberId === props.myMemberId;
              return (
                <TripPhotoTile
                  key={photo.id}
                  assetId={photo.assetId}
                  width={tile}
                  height={tile + 6}
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
        </View>

        <View style={styles.block}>
          <View style={styles.head}>
            <Text style={[typography.title3, styles.text]}>어디서 찍었나요?</Text>
            <Text style={[typography.caption, styles.sub]}>코스 장소</Text>
          </View>
          <CoursePlaceList
            days={props.days}
            state={props.courseState}
            placeId={props.placeId}
            onPlace={props.onPlace}
          />
        </View>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom + spacing[12], 34) }]}>
        <Button
          label="연결하기"
          size="lg"
          disabled={!canConnect}
          loading={props.saving}
          leading={<Icon name="link" size={20} color={colors.text.inverse} />}
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
    gap: spacing[24],
  },
  block: { gap: spacing[12] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
});
