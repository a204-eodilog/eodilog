import { useEffect, useRef, useState } from 'react';

import { toast } from '@/components/ui';
import type { SettingsData } from '@/features/settings/types';

/** 나중에 Query 훅으로 교체할 로컬 데이터 경계. 서버·전역 스토어에 저장하지 않는다. */
export function useSettings(initial: SettingsData, simulateFailure: boolean) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);
  const current = useRef(initial);
  const busy = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function change(
    update: (previous: SettingsData) => SettingsData,
    failureMessage: string,
    retry = false,
  ) {
    if (!mounted.current || busy.current) return;
    const previous = current.current;
    const next = update(previous);
    current.current = next;
    setData(next);

    if (!simulateFailure || retry) return;
    // 한 번에 하나만 바꿔 실패 복원이 이후 변경까지 덮어쓰지 않게 한다.
    busy.current = true;
    setPending(true);
    timer.current = setTimeout(() => {
      current.current = previous;
      setData(previous);
      busy.current = false;
      setPending(false);
      timer.current = null;
      toast.error(failureMessage, {
        action: { label: '다시 시도', onPress: () => change(update, failureMessage, true) },
      });
    }, 650);
  }

  return { data, pending, change };
}
