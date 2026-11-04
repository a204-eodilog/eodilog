import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, size, typography } from '@/theme';

export type AvatarProps = {
  /** 닉네임. 사진이 없으면 첫 글자를 보여 준다 */
  name: string;
  imageUrl?: string | null;
  /** sm 24 / md 28 / lg 40. 토큰에 없는 지름은 숫자로(S35·S36 줄 얼굴 36) */
  size?: 'sm' | 'md' | 'lg' | number;
  /** 나. Figma처럼 연파랑 바탕에 진파랑 글자로 다른 동행과 구분한다 */
  me?: boolean;
};

/**
 * 동행 얼굴. 사진이 있으면 사진, 없으면 동그라미에 닉네임 첫 글자.
 * 다른 동행은 회색, 나는 연파랑(Figma S31·S35·S36).
 */
export function Avatar({ name, imageUrl, size: sz = 'md', me = false }: AvatarProps) {
  const dim = typeof sz === 'number' ? sz : size.avatar[sz];
  const base = { width: dim, height: dim, borderRadius: radius.full };
  // 36 이상은 굵은 본문, 그보다 작으면 굵은 캡션(Figma S35 얼굴 글자)
  const letterStyle = dim >= 36 ? typography.bodyBold : typography.captionBold;

  if (imageUrl) {
    return (
      <Image source={{ uri: imageUrl }} style={base} contentFit="cover" accessibilityLabel={name} />
    );
  }

  return (
    <View style={[styles.fallback, me && styles.fallbackMe, base]} accessibilityLabel={name}>
      <Text style={[letterStyle, me ? styles.letterMe : styles.letter]}>
        {name.trim().charAt(0)}
      </Text>
    </View>
  );
}

export type AvatarGroupProps = {
  people: { name: string; imageUrl?: string | null; me?: boolean }[];
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
          <Avatar name={p.name} imageUrl={p.imageUrl} size={sz} me={p.me} />
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
  fallbackMe: { backgroundColor: colors.brand.primaryLight },
  letter: { color: colors.text.strong },
  letterMe: { color: colors.brand.primaryDark },
  group: { flexDirection: 'row', alignItems: 'center' },
  ring: { borderWidth: 2, borderColor: colors.surface.white, borderRadius: radius.full },
  rest: { backgroundColor: colors.gray[200], alignItems: 'center', justifyContent: 'center' },
  restText: { color: colors.text.sub },
});
