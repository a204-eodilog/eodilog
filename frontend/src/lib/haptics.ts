import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * 진동 다섯 가지(2026-11-11 사용자 결정). 화면은 이 이름으로만 부른다.
 *
 * | 진동 | 넣는 곳 |
 * | light 가볍게 | 탭 바꾸기, 주요 버튼(큰 파랑·빨강 버튼) |
 * | select 선택 | 체크, 투표 고르기, 칩 고르기 |
 * | success 성공 | 여행 만들기, 투표 열기, 저장, 변경안 적용 |
 * | warning 경고 | 지우기·나가기 확인 시트가 뜰 때 |
 * | error 실패 | 요청이 실패했다는 안내가 뜰 때 |
 *
 * 작은 버튼은 울리지 않는다. 웹에는 진동이 없어 아무 일도 하지 않는다.
 * 휴대폰에서 터치 진동을 꺼 두었으면 울리지 않는다(기기 설정을 따른다).
 * 진동은 실패해도 화면 동작을 막으면 안 돼서 오류를 모두 삼킨다
 */
function run(fire: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  try {
    void fire().catch(() => undefined);
  } catch {
    // 진동 모듈이 없는 환경(테스트 등)
  }
}

export const haptic = {
  /** 가볍게. 탭 바꾸기, 주요 버튼 */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** 선택. 체크, 투표 고르기, 칩 고르기 */
  select: () => run(() => Haptics.selectionAsync()),
  /** 성공. 여행 만들기, 투표 열기, 저장, 변경안 적용 */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** 경고. 지우기·나가기 확인 시트가 뜰 때 */
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** 실패. 요청이 실패했다는 안내가 뜰 때 */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
