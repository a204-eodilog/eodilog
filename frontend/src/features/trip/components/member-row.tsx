import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Tag } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import type { TripMember } from '../types';

type Props = {
  member: TripMember;
  /** memberLabel 결과. "방장", "나" */
  labels: ('방장' | '나')[];
};

/** S18 함께하는 사람 한 줄. 얼굴(사진이 없으면 첫 글자), 닉네임, 오른쪽에 방장·나 표시 */
export function MemberRow({ member, labels }: Props) {
  const isMe = labels.includes('나');
  return (
    <View style={styles.row}>
      {/* 피그마 S18 얼굴 32. 토큰에 없는 지름이라 숫자로 쓴다 */}
      <Avatar
        name={member.user.nickname}
        imageUrl={member.user.profileImageUrl}
        size={32}
        me={isMe}
      />
      <Text style={[typography.body, styles.name]} numberOfLines={1}>
        {member.user.nickname}
      </Text>
      {/* Tag는 기본이 위로 붙음(alignSelf flex-start)이라 묶어서 줄 가운데에 맞춘다 */}
      {labels.length > 0 ? (
        <View style={styles.labels}>
          {labels.map((label) => (
            <Tag key={label} label={label} small />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // 피그마 S18 줄: 높이 44, 얼굴과 이름 사이 14
    gap: spacing[14],
    minHeight: layout.minTouchTarget,
  },
  name: { flex: 1, color: colors.text.default },
  labels: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
});
