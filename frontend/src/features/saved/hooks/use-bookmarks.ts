import { onlineManager, useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { secureStorage } from '@/lib/secure-storage';

import { getAllBookmarks } from '../api';

export const bookmarkKeys = { all: ['me', 'bookmarks'] as const };

/** 개인 즐겨찾기 전부. 저장(S08)·해제(S14)가 생기면 이 키를 다시 읽는다 */
export function useBookmarks() {
  return useQuery({ queryKey: bookmarkKeys.all, queryFn: getAllBookmarks });
}

/**
 * 인터넷 연결 여부. 앱 시작 때 NetInfo를 TanStack Query onlineManager에 연결해 두었다(api/query-focus.ts).
 * 끊기면 요청이 멈췄다가 연결이 돌아오면 다시 보낸다(값 문서 "자동 재시도")
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
}

export type SavedView = 'list' | 'map';
const VIEW_KEY = 'eodilog.savedView';

/** 목록 / 지도 보기. 마지막 선택을 기기에 남긴다(값 문서 "마지막 선택을 기억") */
export function useSavedView(): [SavedView, (view: SavedView) => void] {
  const [view, setView] = useState<SavedView>('list');
  useEffect(() => {
    let alive = true;
    void secureStorage.get(VIEW_KEY).then((saved) => {
      if (alive && (saved === 'list' || saved === 'map')) setView(saved);
    });
    return () => {
      alive = false;
    };
  }, []);
  const change = (next: SavedView) => {
    setView(next);
    void secureStorage.set(VIEW_KEY, next);
  };
  return [view, change];
}
