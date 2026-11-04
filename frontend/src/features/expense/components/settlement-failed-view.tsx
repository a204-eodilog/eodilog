import { CenterNotice } from '@/components/ui';

type SettlementFailedViewProps = {
  /** "지출 3건은 그대로예요" */
  expenseCount: number;
  onRetry: () => void;
  retrying?: boolean;
  /** [경비 목록 보기] → S35 */
  onBack: () => void;
};

/** S36 계산 실패. README 상태 공통 모양의 가운데 안내 화면 */
export function SettlementFailedView({
  expenseCount,
  onRetry,
  retrying = false,
  onBack,
}: SettlementFailedViewProps) {
  return (
    <CenterNotice
      icon="calculator"
      title="정산을 계산하지 못했어요"
      description={`지출 ${expenseCount}건은 그대로예요. 다시 계산해 주세요`}
      actionLabel="다시 계산"
      actionIcon="refresh"
      onAction={onRetry}
      actionLoading={retrying}
      secondaryLabel="경비 목록 보기"
      onSecondary={onBack}
    />
  );
}
