import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { UserCard } from '@/api/types';
import { Avatar, Icon } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

import { ROOM_FACES_SIZE, roomFaceLayout } from '../room-faces-rules';

/** 얼굴 사이를 가르는 테두리 두께. 바탕색과 같은 색으로 둘러 겹친 얼굴을 나눈다 */
const RING = 2;

/**
 * S46 대화방 얼굴 묶음(채팅 탭 목록 전용). 참여자 순서대로 최대 세 명, 사진이 없으면 닉네임 첫 글자.
 * 전체 인원은 방 이름 옆(MemberCount)에 따로 보여 "+N" 배지는 두지 않는다
 */
export function RoomFaces({
  participants,
  meId,
  ringColor,
}: {
  participants: UserCard[];
  meId: string | null;
  /** 카드 바탕색. 겹친 얼굴 사이 테두리 색 */
  ringColor: string;
}) {
  const layout = roomFaceLayout(participants.length);
  return (
    <View
      style={styles.box}
      // 인원은 카드 읽기 문구에 들어 있어 얼굴은 따로 읽지 않는다
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {layout.map((f, i) => {
        const p = participants[i];
        const ring: ViewStyle = {
          left: f.left,
          top: f.top,
          width: f.size,
          height: f.size,
          borderRadius: f.size / 2,
          borderColor: ringColor,
        };
        return (
          <View key={p.id} style={[styles.ring, ring]}>
            <Avatar
              name={p.nickname}
              imageUrl={p.profileImageUrl}
              size={f.size - RING * 2}
              me={p.id === meId}
            />
          </View>
        );
      })}
    </View>
  );
}

/** 방 이름 옆 전체 인원 "사람 아이콘 20". 차분한 회색(text.sub2, 아이콘·숫자 같은 색), 이름이 길어 줄어도 숫자는 남는다 */
export function MemberCount({ count }: { count: number }) {
  return (
    <View style={styles.count}>
      <Icon name="people" size={13} color={colors.text.sub2} />
      <Text style={[typography.captionMedium, styles.countText]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: ROOM_FACES_SIZE, height: ROOM_FACES_SIZE },
  ring: {
    position: 'absolute',
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexShrink: 0 },
  countText: { color: colors.text.sub2 },
});
