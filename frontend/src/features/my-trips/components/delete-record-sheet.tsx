import { ConfirmSheet } from '@/components/ui';

type DeleteRecordSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deleting?: boolean;
  /** 지우지 못했을 때. 오류 띠가 뜨고 버튼이 [다시 시도]로 바뀐다 */
  failed?: boolean;
};

/**
 * S50 기록 삭제 확인(S38 [기록 삭제]). 사진 삭제와 같은 짧은 시트, 문구는 값 문서 S50 "기록 삭제".
 * 기록 삭제 API가 아직 없어 무엇이 지워지는지 정해지면 문구를 맞춘다
 */
export function DeleteRecordSheet({
  visible,
  onClose,
  onConfirm,
  deleting = false,
  failed = false,
}: DeleteRecordSheetProps) {
  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      onConfirm={onConfirm}
      title="이 여행 기록을 지울까요?"
      description={'내 지도와 피드에서 이 여행이 빠져요.\n여행과 동행의 기록은 그대로예요'}
      confirmLabel={failed ? '다시 시도' : '지우기'}
      confirmIcon={failed ? 'refresh' : 'trash'}
      loading={deleting}
      error={failed ? '기록을 지우지 못했어요' : undefined}
      errorDescription="다시 시도해 주세요"
    />
  );
}
