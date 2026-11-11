import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, layout, spacing, typography } from '@/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Stagger } from './stagger';

export type EmptyStateProps = {
  /** "아직 여행이 없어요" */
  title: string;
  /** "새 여행을 만들거나 초대 링크로 참여해요" */
  description?: string;
  /** 큰 버튼 글자와 동작. 없으면 버튼이 없다 */
  actionLabel?: string;
  onAction?: () => void;
  /** 회색 동그라미 안에 넣을 아이콘. 화면 내용에 맞춰 고른다(여행 trip, 장소 map-pin, 대화 chat …) */
  icon?: IconName;
  /** 아이콘 대신 쓸 그림. 첫 방문 홈의 걷는 마스코트처럼 특별한 경우에만 */
  illustration?: ReactNode;
};

/** 빈 화면. 모든 목록·상세 화면이 공통으로 쓴다. 가운데 아이콘 + 제목 + 설명 + 버튼. */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon = 'trip',
  illustration,
}: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {/* 그림 → 제목 → 설명 → 버튼이 한 줄씩 나타난다 */}
      <Stagger itemStyle={styles.line}>
        {illustration ?? (
          <View style={styles.iconCircle}>
            <Icon name={icon} size={32} color={colors.text.icon} />
          </View>
        )}
        <Text style={[typography.title1, styles.title]}>{title}</Text>
        {description ? (
          <Text style={[typography.body, styles.description]}>{description}</Text>
        ) : null}
        {actionLabel ? (
          <Button
            label={actionLabel}
            onPress={onAction}
            leading={<Icon name="plus" size={20} color={colors.text.inverse} />}
            style={styles.action}
          />
        ) : null}
      </Stagger>
    </View>
  );
}

export type ErrorStateProps = {
  /** "불러오지 못했어요" */
  title?: string;
  /** "연결이 불안정해요. 다시 시도해 주세요". null이면 설명 줄 없이 아이콘과 제목만 보인다 */
  description?: string | null;
  /** 동그라미 안 아이콘. 기본 alert. 연결 끊김 wifi-off, 볼 수 없음 lock처럼 까닭을 아이콘으로 보일 때 */
  icon?: IconName;
  retryLabel?: string;
  onRetry?: () => void;
};

/** 오류 화면. 불러오기 실패·연결 끊김에 쓴다. 문구만 바꾸고 모양은 같다. */
export function ErrorState({
  title = '불러오지 못했어요',
  description = '연결을 확인하고 다시 시도해 주세요',
  icon = 'alert',
  retryLabel = '다시 시도',
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.wrap}>
      <Stagger itemStyle={styles.line}>
        <View style={styles.errorIcon}>
          <Icon name={icon} size={32} color={colors.status.danger} />
        </View>
        <Text style={[typography.title3, styles.title]}>{title}</Text>
        {description ? (
          <Text style={[typography.body, styles.description]}>{description}</Text>
        ) : null}
        {onRetry ? (
          <Button label={retryLabel} variant="secondary" onPress={onRetry} style={styles.action} />
        ) : null}
      </Stagger>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
    gap: spacing[8],
  },
  // 순서대로 나오게 하려고 줄마다 한 겹 감싼다. 감싼 칸도 가운데로 모은다
  line: { alignItems: 'center' },
  title: { color: colors.text.default, textAlign: 'center', marginTop: spacing[16] },
  description: { color: colors.text.icon, textAlign: 'center' },
  // Button은 기본이 왼쪽 붙음(alignSelf flex-start)이라 가운데로 다시 맞춘다
  action: { alignSelf: 'center', marginTop: spacing[16] },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.status.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
