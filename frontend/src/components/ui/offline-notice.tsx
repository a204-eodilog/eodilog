import { CenterNotice } from './center-notice';

export type OfflineNoticeProps = {
  /** 다시 시도. 없으면 버튼을 두지 않는다(연결되면 자동으로 다시 받는다) */
  onRetry?: () => void;
};

/**
 * 받아 둔 데이터 없이 연결이 끊긴 채 화면을 열었을 때의 안내. 로딩만 계속 돌지 않게 한다.
 * 문구는 저장 탭(S10)의 끊김 안내와 같다
 */
export function OfflineNotice({ onRetry }: OfflineNoticeProps) {
  return (
    <CenterNotice
      icon="wifi-off"
      title="인터넷에 연결되지 않았어요"
      description="연결되면 자동으로 불러와요"
      actionLabel={onRetry ? '다시 시도' : undefined}
      actionIcon={onRetry ? 'refresh' : undefined}
      onAction={onRetry}
    />
  );
}
