import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { seoulToday } from '@/lib/seoul-date';

/**
 * 서울 기준 오늘 'YYYY-MM-DD'. 앱이 다시 앞으로 오면 새로 구한다.
 * 화면을 열어 둔 채 자정이 지나도 여행 상태·D-day가 맞게 바뀐다. 날짜가 같으면 다시 그리지 않는다.
 */
export function useSeoulToday(): string {
  const [today, setToday] = useState(() => seoulToday());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(seoulToday());
    });
    return () => sub.remove();
  }, []);

  return today;
}
