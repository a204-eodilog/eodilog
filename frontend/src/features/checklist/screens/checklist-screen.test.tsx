import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';

import { getChecklist, updateChecklistItem } from '../api';
import { checklistItem, httpError, networkError } from '../testing';
import type { ChecklistItem } from '../types';

import { ChecklistScreen } from './checklist-screen';

const mockParams = { tripId: 'trip-1' };
const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn() };
const mockTrip: { data: unknown; error: unknown } = {
  data: {
    id: 'trip-1',
    title: '겨울 여행',
    members: [
      {
        id: 'm-me',
        status: 'ACTIVE',
        user: { id: 'u-me', nickname: '영광', profileImageUrl: null },
      },
      {
        id: 'm-seeun',
        status: 'ACTIVE',
        user: { id: 'u-seeun', nickname: '세은', profileImageUrl: null },
      },
    ],
  },
  error: null,
};

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  // jest.mock은 위로 끌어올려져 mockRouter가 만들어지기 전에 불릴 수 있어 꺼낼 때 읽는다
  get router() {
    return mockRouter;
  },
}));

jest.mock('../api', () => ({
  getChecklist: jest.fn(),
  addChecklistItem: jest.fn(),
  adoptSuggestion: jest.fn(),
  updateChecklistItem: jest.fn(),
  deleteChecklistItem: jest.fn(),
  requestSuggestions: jest.fn(),
  getSuggestionJob: jest.fn(),
}));

jest.mock('@/features/trip/hooks/use-trip', () => ({
  tripKey: (id: string) => ['trips', id],
  useTrip: () => mockTrip,
}));

jest.mock('@/hooks/use-me', () => ({
  useMe: () => ({ data: { id: 'u-me', nickname: '영광' } }),
}));

// 하단 시트는 네이티브 애니메이션이 필요해 테스트에서는 내용만 그대로 그린다
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text, TextInput, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Button = ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
  return {
    Icon: actual.Icon,
    Button,
    Tag: ({ label }: { label: string }) => <Text>{label}</Text>,
    Header: ({ title }: { title?: string }) => <Text>{title}</Text>,
    AvatarGroup: () => null,
    TextField: (props: Record<string, unknown>) => <TextInput {...props} />,
    ErrorState: ({
      title,
      retryLabel,
      onRetry,
    }: {
      title?: string;
      retryLabel?: string;
      onRetry?: () => void;
    }) => (
      <View>
        <Text>{title ?? '불러오지 못했어요'}</Text>
        <Button label={retryLabel ?? '다시 시도'} onPress={onRetry} />
      </View>
    ),
    BottomSheet: ({
      visible,
      title,
      children,
      footer,
    }: {
      visible: boolean;
      title?: string;
      children?: ReactNode;
      footer?: ReactNode;
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          {children}
          {footer}
        </View>
      ) : null,
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

// 첫 렌더가 느린 환경(아이콘 SVG)에서도 기다리도록 넉넉히 둔다
jest.setTimeout(20_000);

const mockGet = jest.mocked(getChecklist);
const mockUpdate = jest.mocked(updateChecklistItem);

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  // 아래 고정 줄이 안전 영역을 읽는다. 테스트에서는 크기를 정해 준다
  const metrics = {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  };
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <ChecklistScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const umbrella = () =>
  checklistItem({
    id: 'umbrella',
    label: '우산',
    source: 'AI',
    reason: '오전 비 70%',
    checked: true,
    checkedByMemberId: 'm-seeun',
    version: 2,
  });
const raincoat = () =>
  checklistItem({ id: 'raincoat', label: '우비', source: 'AI', reason: '오전 비 70%', version: 1 });
const warmer = () => checklistItem({ id: 'warmer', label: '손난로', version: 1 });

/** 체크 요청에 서버가 그대로 저장한 것처럼 답한다 */
function echoUpdate() {
  mockUpdate.mockImplementation(async (_trip, itemId, body) => {
    const base = [umbrella(), raincoat(), warmer()].find((i) => i.id === itemId) as ChecklistItem;
    const version = body.expectedVersion + 1;
    return {
      ...base,
      checked: body.checked ?? base.checked,
      checkedByMemberId: body.checked ? 'm-me' : null,
      version,
    };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue([umbrella(), raincoat(), warmer()]);
});

describe('목록 보고 체크하기', () => {
  it('진행 숫자, 이유와 챙긴 사람, 직접 추가 표시가 보인다', async () => {
    await renderScreen();
    expect(await screen.findByText('3개 중 1개 챙겼어요')).toBeTruthy();
    expect(screen.getByText('오전 비 70% · 세은이 챙겨요')).toBeTruthy();
    expect(screen.getByText('오전 비 70%')).toBeTruthy();
    expect(screen.getByText('직접 추가')).toBeTruthy();
  });

  it('체크하면 저장을 기다리지 않고 진행 숫자와 내 이름이 바뀐다', async () => {
    let resolve: (item: ChecklistItem) => void = () => {};
    mockUpdate.mockReturnValue(
      new Promise<ChecklistItem>((r) => {
        resolve = r;
      }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('우비'));

    // 캐시 변경은 다음 틱에 화면에 닿는다. 저장 응답은 아직 오지 않았다
    expect(await screen.findByText('3개 중 2개 챙겼어요')).toBeTruthy();
    expect(screen.getByText('오전 비 70% · 영광이 챙겨요')).toBeTruthy();
    expect(mockUpdate).toHaveBeenCalledWith('trip-1', 'raincoat', {
      expectedVersion: 1,
      checked: true,
    });
    await act(async () => {
      resolve({ ...raincoat(), checked: true, checkedByMemberId: 'm-me', version: 2 });
    });
  });

  it('빠르게 다섯 번 눌러도 요청은 세 번 이하이고 챙긴 상태로 끝난다', async () => {
    echoUpdate();
    await renderScreen();
    const box = await screen.findByLabelText('손난로');
    await act(async () => {
      for (let i = 0; i < 5; i += 1) fireEvent.press(box);
    });
    await waitFor(() => expect(screen.getByText('3개 중 2개 챙겼어요')).toBeTruthy());
    expect(mockUpdate.mock.calls.length).toBeLessThanOrEqual(3);
    expect(mockUpdate.mock.calls.at(-1)?.[2].checked).toBe(true);
  });

  it('다른 동행이 먼저 바꿨으면 안내하고 최신 목록을 다시 받는다', async () => {
    mockUpdate.mockRejectedValue(httpError(409, 'VERSION_CONFLICT'));
    await renderScreen();
    await screen.findByText('3개 중 1개 챙겼어요');
    const latest = { ...raincoat(), checked: true, checkedByMemberId: 'm-seeun', version: 2 };
    mockGet.mockResolvedValue([umbrella(), latest, warmer()]);
    await fireEvent.press(screen.getByLabelText('우비'));

    await waitFor(() =>
      expect(toast.show).toHaveBeenCalledWith('다른 동행이 먼저 바꿨어요. 최신 목록을 불러왔어요'),
    );
    await waitFor(() => expect(screen.getAllByText('오전 비 70% · 세은이 챙겨요')).toHaveLength(2));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('다른 동행이 지운 항목이면 목록에서 빼고 안내한다', async () => {
    mockUpdate.mockRejectedValue(httpError(404, 'CHECKLIST_ITEM_NOT_FOUND'));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('손난로'));
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith('이미 지워진 준비물이에요'));
    expect(await screen.findByText('2개 중 1개 챙겼어요')).toBeTruthy();
    expect(screen.queryByLabelText('손난로')).toBeNull();
  });

  it('연결이 끊기면 마지막으로 저장된 상태로 되돌린다', async () => {
    mockUpdate.mockRejectedValue(networkError());
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('우산'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('저장하지 못했어요. 연결을 확인해 주세요'),
    );
    expect(screen.getByText('3개 중 1개 챙겼어요')).toBeTruthy();
    expect(screen.getByText('오전 비 70% · 세은이 챙겨요')).toBeTruthy();
  });
});

describe('불러오기', () => {
  it('목록을 받지 못하면 다시 시도할 수 있다', async () => {
    // 연결 오류는 한 번 다시 시도한 뒤 실패를 보인다
    mockGet.mockRejectedValueOnce(networkError()).mockRejectedValueOnce(networkError());
    await renderScreen();
    expect(
      await screen.findByText('준비물을 불러오지 못했어요', {}, { timeout: 4000 }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('다시 시도'));
    expect(await screen.findByText('3개 중 1개 챙겼어요')).toBeTruthy();
  });

  it('볼 수 없는 여행이면 돌아가기를 보인다', async () => {
    mockGet.mockRejectedValue(httpError(404, 'TRIP_NOT_FOUND'));
    await renderScreen();
    expect(await screen.findByText('여행을 찾을 수 없어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('돌아가기'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
