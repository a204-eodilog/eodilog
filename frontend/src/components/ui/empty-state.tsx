import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, layout, spacing, typography } from '@/theme';

import { Button } from './button';
import { Icon, Placeholder } from './icon';

export type EmptyStateProps = {
  /** "아직 여행이 없어요" */
  title: string;
  /** "새 여행을 만들거나 초대 링크로 참여해요" */
  description?: string;
  /** 큰 버튼 글자와 동작. 없으면 버튼이 없다 */
  actionLabel?: string;
  onAction?: () => void;
  /** 그림 자리. 기본은 자리표시 그림이고, 마스코트가 오면 바꾼다 */
  illustration?: ReactNode;
};

/** 빈 화면. 모든 목록·상세 화면이 공통으로 쓴다. 가운데 그림 + 제목 + 설명 + 버튼. */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  illustration,
}: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {illustration ?? <Placeholder />}
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
    </View>
  );
}

export type ErrorStateProps = {
  /** "불러오지 못했어요" */
  title?: string;
  /** "연결이 불안정해요. 다시 시도해 주세요" */
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

/** 오류 화면. 불러오기 실패·연결 끊김에 쓴다. 문구만 바꾸고 모양은 같다. */
export function ErrorState({
  title = '불러오지 못했어요',
  description = '연결을 확인하고 다시 시도해 주세요',
  retryLabel = '다시 시도',
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.errorIcon}>
        <Icon name="alert" size={32} color={colors.status.danger} />
      </View>
      <Text style={[typography.title3, styles.title]}>{title}</Text>
      <Text style={[typography.body, styles.description]}>{description}</Text>
      {onRetry ? (
        <Button label={retryLabel} variant="secondary" onPress={onRetry} style={styles.action} />
      ) : null}
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
  title: { color: colors.text.default, textAlign: 'center', marginTop: spacing[16] },
  description: { color: colors.text.icon, textAlign: 'center' },
  action: { marginTop: spacing[16] },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.status.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
