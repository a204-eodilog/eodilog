import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

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
  /** 처리 실패 제목. 있으면 버튼 위에 오류 띠가 뜬다. "나가지 못했어요" */
  error?: string;
  /** 오류 띠 아래 줄 안내. "다시 시도해 주세요" */
  errorDescription?: string;
  /** 바뀌는 것 목록처럼 설명 아래 더 넣을 내용. 여행 나가기에서 쓴다 */
  children?: ReactNode;
};

/**
 * S50 삭제·나가기·탈퇴 확인. 되돌릴 수 없는 일을 하기 전에 아래에서 올라온다.
 * 사진 삭제(S32), 지출 삭제(S35), 기록 삭제(S38), 여행 나가기(S19), 탈퇴(S45)가 같이 쓴다.
 * 처리 중(loading)에는 버튼도 막고, 어두운 막·끌어서 닫기도 막는다.
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
  errorDescription,
  children,
}: ConfirmSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      locked={loading}
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
            // 아이콘 없는 버튼은 좌우 24(S50 탈퇴 [탈퇴하기]). 아이콘이 있으면 공통 버튼 기본값
            style={confirmIcon ? undefined : styles.plainConfirm}
          />
        </>
      }
    >
      {children || error ? (
        <View style={styles.body}>
          {children}
          {error ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Icon name="alert" size={20} color={colors.status.danger} />
              <View style={styles.errorTexts}>
                <Text style={[typography.bodyBold, styles.errorTitle]}>{error}</Text>
                {errorDescription ? (
                  <Text style={[typography.caption, styles.errorDescription]}>
                    {errorDescription}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[16] },
  cancel: { paddingHorizontal: spacing[16], paddingVertical: spacing[12] },
  plainConfirm: { paddingHorizontal: spacing[24] },
  cancelLabel: { color: colors.text.icon },
  pressed: { opacity: 0.6 },
  // 오류 띠(docs/design/screens README 상태 공통 모양). 피그마 둥글기 14는 토큰에 없어 12로 맞춘다
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[16],
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[18],
    borderRadius: radius.md,
    backgroundColor: colors.surface.subtle,
  },
  errorTexts: { flex: 1 },
  errorTitle: { color: colors.status.danger },
  errorDescription: { color: colors.text.icon },
});
