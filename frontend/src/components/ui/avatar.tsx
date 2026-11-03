import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, size, typography } from '@/theme';

export type AvatarProps = {
  /** 닉네임. 사진이 없으면 첫 글자를 보여 준다 */
  name: string;
  imageUrl?: string | null;
  /** sm 24 / md 28 / lg 40 */
  size?: 'sm' | 'md' | 'lg';
};

/** 동행 얼굴. 사진이 있으면 사진, 없으면 회색 동그라미에 닉네임 첫 글자(Figma 기본 모습). */
export function Avatar({ name, imageUrl, size: sz = 'md' }: AvatarProps) {
  const dim = size.avatar[sz];
  const base = { width: dim, height: dim, borderRadius: radius.full };

  if (imageUrl) {
    return (
      <Image source={{ uri: imageUrl }} style={base} contentFit="cover" accessibilityLabel={name} />
    );
  }

  return (
    <View style={[styles.fallback, base]} accessibilityLabel={name}>
      <Text style={[sz === 'lg' ? typography.bodyBold : typography.captionBold, styles.letter]}>
        {name.trim().charAt(0)}
      </Text>
    </View>
  );
}

export type AvatarGroupProps = {
  people: { name: string; imageUrl?: string | null }[];
  /** 이 수를 넘으면 "+N"으로 줄인다 */
  max?: number;
  size?: 'sm' | 'md';
};

/** 동행 여러 명을 겹쳐 보여 준다. 그룹 즐겨찾기 카드의 "담은 사람"에 쓴다. */
export function AvatarGroup({ people, max = 4, size: sz = 'sm' }: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const dim = size.avatar[sz];

  return (
    <View style={styles.group}>
      {shown.map((p, i) => (
        <View key={`${p.name}-${i}`} style={[styles.ring, i > 0 && { marginLeft: -dim / 4 }]}>
          <Avatar name={p.name} imageUrl={p.imageUrl} size={sz} />
        </View>
      ))}
      {rest > 0 ? (
        <View
          style={[
            styles.ring,
            styles.rest,
            { width: dim, height: dim, borderRadius: radius.full, marginLeft: -dim / 4 },
          ]}
        >
          <Text style={[typography.micro, styles.restText]}>+{rest}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.line.default,
  },
  letter: { color: colors.text.strong },
  group: { flexDirection: 'row', alignItems: 'center' },
  ring: { borderWidth: 2, borderColor: colors.surface.white, borderRadius: radius.full },
  rest: { backgroundColor: colors.gray[200], alignItems: 'center', justifyContent: 'center' },
  restText: { color: colors.text.sub },
});
