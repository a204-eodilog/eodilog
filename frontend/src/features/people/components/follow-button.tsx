import { Button, type IconName } from '@/components/ui';
import { colors } from '@/theme';

import type { FollowButtonState } from '../types';

const LABEL: Record<FollowButtonState, string> = {
  follow: '팔로우',
  requested: '요청됨',
  following: '팔로잉',
};

/** 상태마다 아이콘. 글자 없이 아이콘만 그린다: 팔로우는 사람 더하기, 요청됨은 시계, 팔로잉은 체크 */
const ICON: Record<FollowButtonState, IconName> = {
  follow: 'person-plus',
  requested: 'clock',
  following: 'check',
};

/**
 * 팔로우 버튼(결정 Q-2). 팔로우는 파랑, 요청됨·팔로잉은 회색. 비공개 계정 N9에서는 "팔로우 요청"
 */
export function FollowButton({
  state,
  onPress,
  loading,
  privateAccount = false,
  compact = false,
  onCard = false,
}: {
  state: FollowButtonState;
  onPress: () => void;
  loading?: boolean;
  privateAccount?: boolean;
  compact?: boolean;
  /** 회색 카드 위. 요청됨·팔로잉 회색 버튼이 카드에 묻히지 않게 흰 바탕 */
  onCard?: boolean;
}) {
  const follow = state === 'follow';
  return (
    <Button
      label={follow && privateAccount ? '팔로우 요청' : LABEL[state]}
      variant={follow ? 'primary' : 'neutral'}
      onPress={onPress}
      loading={loading}
      size={compact ? 'sm' : undefined}
      style={!follow && onCard ? { backgroundColor: colors.surface.white } : undefined}
      icon={ICON[state]}
    />
  );
}
