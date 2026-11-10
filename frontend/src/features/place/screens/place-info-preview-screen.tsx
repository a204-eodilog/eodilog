import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { toast } from '@/components/ui';
import { colors, typography } from '@/theme';

import { PlaceInfoSheetView } from '../components/place-info-sheet';
import type { PlaceInfo } from '../info';

/** Figma N7: 명주동 골목 카페, 다녀간 친구 1명, 4.5 "조용히 쉬기 좋아요" */
const INFO: PlaceInfo = {
  placeId: 'p',
  name: '명주동 골목 카페',
  address: '강릉 명주동',
  photoUrl: null,
  reason: '좋아요한 여행과 비슷해요',
  visitorsLine: '가람이 다녀왔어요',
  firstVisitor: '가람',
  score: 4.5,
  review: '조용히 쉬기 좋아요',
};

/** /dev/place-info?state=basic|loading|error */
export function PlaceInfoPreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: string }>();
  const [open, setOpen] = useState(true);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={styles.screen}>
      <Pressable onPress={() => setOpen(true)} style={styles.open} accessibilityRole="button">
        <Text style={styles.openText}>N7 장소 정보 시트 열기</Text>
      </Pressable>
      <PlaceInfoSheetView
        visible={open}
        state={state === 'loading' || state === 'error' ? state : 'ready'}
        info={INFO}
        onClose={() => setOpen(false)}
        onSave={() => toast.show('S08 장소 저장 시트를 열어요')}
        onVisitors={() => toast.show('다녀간 친구 목록으로 가요')}
        onRetry={() => toast.show('다시 불러와요')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.map.seaMid, alignItems: 'center', paddingTop: 120 },
  open: { padding: 16 },
  openText: { ...typography.bodyBold, color: colors.brand.primary },
});
