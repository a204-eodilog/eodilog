import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getNotifications, getPollBrief } from '../api';
import { ManyPopup, PollPopup } from '../components/notification-popup';
import { notificationKeys } from '../hooks/notification-keys';
import { useOpenNotification } from '../hooks/use-open-notification';
import {
  deadlineLine,
  notificationTitle,
  pickPopup,
  pollPopupTitle,
  popupTimeLabel,
  toLine,
  type PopupChoice,
} from '../notification-rules';
import type { NotificationView, PollBrief } from '../types';

/** 이번 앱 실행에서 이미 팝업으로 보여 준 알림. 앱을 새로 열면 비어 있다(Q-12-4) */
const shown = new Set<string>();

/** 테스트마다 새 실행처럼 비운다 */
export function resetPopupMemory() {
  shown.clear();
}

/**
 * S48 알림 팝업 자리. 로그인한 화면 묶음에 하나 두고, 처음 그릴 때와 앱으로 돌아올 때 안 읽은 알림을 받아
 * 행동이 필요한 새 알림이 있으면 띄운다. 팝업이 떠 있는 동안에는 다시 받지 않는다. 받지 못하면 조용히 넘긴다
 */
export function NotificationPopupHost() {
  const queryClient = useQueryClient();
  const open = useOpenNotification();
  const [choice, setChoice] = useState<PopupChoice>(null);
  const [brief, setBrief] = useState<PollBrief | null>(null);
  const [now, setNow] = useState(() => new Date());
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const page = await queryClient.fetchQuery({
        queryKey: notificationKeys.popup,
        queryFn: () => getNotifications({ unreadOnly: true }),
        staleTime: 0,
      });
      const picked = pickPopup(page.data, shown);
      if (!picked) {
        busy.current = false;
        return;
      }
      const items = picked.kind === 'poll' ? [picked.item] : picked.items;
      items.forEach((n) => shown.add(n.id));
      setNow(new Date());
      setBrief(null);
      setChoice(picked);
      if (picked.kind === 'poll') {
        const { tripId, target } = picked.item;
        if (tripId && target) {
          getPollBrief(tripId, target.id)
            .then(setBrief)
            .catch(() => undefined);
        }
      }
      // 팝업을 닫을 때 busy를 푼다
    } catch {
      busy.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    // 첫 화면을 다 그린 다음에 받는다
    const first = setTimeout(() => void check(), 0);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [check]);

  const close = () => {
    setChoice(null);
    busy.current = false;
  };
  const go = (n: NotificationView) => {
    close();
    void open(n);
  };

  if (choice?.kind === 'many') {
    return (
      <ManyPopup
        visible
        count={choice.items.length}
        lines={choice.items.map((n) => ({
          ...toLine(n, now, null),
          time: popupTimeLabel(n.createdAt, now),
        }))}
        onLine={(line) => {
          const n = choice.items.find((x) => x.id === line.id);
          if (n) go(n);
        }}
        onClose={close}
        onAll={() => {
          close();
          router.push('/notifications');
        }}
      />
    );
  }
  if (choice?.kind === 'poll') {
    return (
      <PollPopup
        visible
        title={pollPopupTitle(brief)}
        message={notificationTitle(choice.item)}
        deadline={brief ? deadlineLine(brief.closesAt) : null}
        onLater={close}
        onGo={() => go(choice.item)}
      />
    );
  }
  return null;
}
