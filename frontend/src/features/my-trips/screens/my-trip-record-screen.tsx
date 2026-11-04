import { StyleSheet, Text, View } from 'react-native';

import { Header } from '@/components/ui';
import { colors, layout, typography } from '@/theme';

/**
 * S38 내 여행 기록 자리. N4 여행 줄이 여기로 온다.
 * 사진·코스·평가·경비 요약과 공동 피드 게시는 피드 API가 생기면 채운다
 */
export function MyTripRecordScreen() {
  return (
    <View style={styles.screen}>
      <Header title="내 여행 기록" />
      <Text style={[typography.body, styles.text]}>
        여행의 사진·코스·평가·경비를 모아 보는 화면이에요. 다음 작업에서 만들어요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  text: { color: colors.text.sub, padding: layout.screenPaddingX },
});
