import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { Icon, type IconName } from './icon';

export type ConfirmSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** "사진 2장을 지울까요?" */
  title: string;
  /** 무엇이 바뀌고 무엇이 남는지. "휴대폰 원본은 그대로예요" */
  description?: string;
  /** 빨간 버튼 글자. "지우기" "탈퇴하기" */
  confirmLabel: string;
  /** 빨간 버튼 글자 왼쪽 아이콘. 사진·지출 삭제는 trash */
  confirmIcon?: IconName;
  cancelLabel?: string;
  /** 처리 중. 두 버튼을 누를 수 없다 */
  loading?: boolean;
  /** 처리 실패 문구. 있으면 버튼 위에 빨간 글자로 보인다 */
  error?: string;
  /** 바뀌는 것 목록처럼 설명 아래 더 넣을 내용. 여행 나가기에서 쓴다 */
  children?: ReactNode;
};

/**
 * S50 삭제·나가기·탈퇴 확인. 되돌릴 수 없는 일을 하기 전에 아래에서 올라온다.
 * 사진 삭제(S32), 지출 삭제(S35), 기록 삭제(S38), 여행 나가기(S19), 탈퇴(S45)가 같이 쓴다.
 */
export function ConfirmSheet({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  confirmIcon,
  cancelLabel = '취소',
  loading = false,
  error,
  children,
}: ConfirmSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={onClose}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={[typography.bodyMedium, styles.cancelLabel]}>{cancelLabel}</Text>
          </Pressable>
          <Button
            label={confirmLabel}
            variant="danger"
            loading={loading}
            onPress={onConfirm}
            leading={
              confirmIcon ? <Icon name={confirmIcon} size={20} color={colors.text.inverse} /> : null
            }
          />
        </>
      }
    >
      {children || error ? (
        <View style={styles.body}>
          {children}
          {error ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Icon name="alert" size={16} color={colors.status.danger} />
              <Text style={[typography.captionMedium, styles.errorText]}>{error}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[12] },
  cancel: { paddingHorizontal: spacing[16], paddingVertical: spacing[12] },
  cancelLabel: { color: colors.text.icon },
  pressed: { opacity: 0.6 },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  errorText: { color: colors.status.danger },
});
