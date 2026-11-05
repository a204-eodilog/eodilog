import { ConfirmSheet } from '@/components/ui';

type DeleteReviewSheetProps = {
  visible: boolean;
  /** 평가를 남긴 장소. "해운대 해변" */
  placeName: string;
  onClose: () => void;
  onConfirm: () => void;
  deleting?: boolean;
  /** 지우지 못했을 때. 오류 띠가 뜨고 버튼이 [다시 시도]로 바뀐다 */
  failed?: boolean;
};

/**
 * S50 평가 삭제 확인(S34). 사진 삭제와 같은 짧은 시트, 문구는 값 문서 S50 "평가 삭제".
 * S34 화면과 평가 API가 생기면 거기서 연다
 */
export function DeleteReviewSheet({
  visible,
  placeName,
  onClose,
  onConfirm,
  deleting = false,
  failed = false,
}: DeleteReviewSheetProps) {
  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      onConfirm={onConfirm}
      title="내 평가를 삭제할까요?"
      description={`${placeName}에 남긴 점수와 글이 지워져요.\n다시 남길 수 있어요`}
      confirmLabel={failed ? '다시 시도' : '삭제'}
      confirmIcon={failed ? 'refresh' : 'trash'}
      loading={deleting}
      error={failed ? '평가를 삭제하지 못했어요' : undefined}
    />
  );
}
