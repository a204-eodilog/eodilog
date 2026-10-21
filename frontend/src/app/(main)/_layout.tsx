import { Stack } from 'expo-router';

// 탭 구성은 사용자 흐름 EODI-46, 화면 목록 EODI-47 확정 후 Tabs로 바꾼다.
export default function MainLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
