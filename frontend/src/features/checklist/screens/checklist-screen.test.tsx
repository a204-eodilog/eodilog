import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';

import {
  addChecklistItem,
  adoptSuggestion,
  deleteChecklistItem,
  getChecklist,
  getSuggestionJob,
  requestSuggestions,
  updateChecklistItem,
} from '../api';
import { checklistItem, httpError, networkError, suggestion, suggestionJob } from '../testing';
import type { ChecklistItem, JobRef } from '../types';

import { checklistKey } from '../hooks/checklist-keys';

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
const mockAdd = jest.mocked(addChecklistItem);
const mockDelete = jest.mocked(deleteChecklistItem);
const mockRequest = jest.mocked(requestSuggestions);
const mockJob = jest.mocked(getSuggestionJob);
const mockAdopt = jest.mocked(adoptSuggestion);
const REF: JobRef = { jobId: 'job-1', status: 'QUEUED', statusUrl: '/api/v1/jobs/job-1' };

let lastClient: QueryClient;
function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  lastClient = client;
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
    // 화면 읽기 기능도 이유와 챙긴 사람, 출처를 듣는다
    expect(screen.getByLabelText('우산').props.accessibilityHint).toBe(
      '오전 비 70% · 세은이 챙겨요',
    );
    expect(screen.getByLabelText('손난로').props.accessibilityHint).toBe('직접 추가');
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
    expect(await screen.findByText('연결이 끊겼어요', {}, { timeout: 4000 })).toBeTruthy();
    await fireEvent.press(screen.getByText('다시 시도'));
    expect(await screen.findByText('3개 중 1개 챙겼어요')).toBeTruthy();
  });

  it('볼 수 없는 여행이면 돌아가기를 보인다', async () => {
    mockGet.mockRejectedValue(httpError(404, 'TRIP_NOT_FOUND'));
    await renderScreen();
    expect(await screen.findByText('볼 수 없어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('돌아가기'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('직접 추가, 고치기, 지우기', () => {
  it('이름을 쓰고 추가하면 목록 끝에 직접 추가로 붙고 입력이 비워진다', async () => {
    mockAdd.mockResolvedValue(checklistItem({ id: 'snack', label: '간식' }));
    await renderScreen();
    const input = await screen.findByLabelText('챙길 것 추가');
    await fireEvent.changeText(input, '  간식 ');
    await fireEvent.press(screen.getByLabelText('추가'));

    expect(mockAdd).toHaveBeenCalledWith('trip-1', '간식');
    expect(await screen.findByText('4개 중 1개 챙겼어요')).toBeTruthy();
    expect(screen.getByLabelText('간식')).toBeTruthy();
    expect(screen.getByLabelText('챙길 것 추가').props.value).toBe('');
  });

  it('비었거나 공백뿐이면 추가하지 않는다', async () => {
    await renderScreen();
    const input = await screen.findByLabelText('챙길 것 추가');
    await fireEvent.changeText(input, '   ');
    await fireEvent.press(screen.getByLabelText('추가'));
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('추가를 두 번 빨리 눌러도 하나만 보낸다', async () => {
    let resolve: (item: ChecklistItem) => void = () => {};
    mockAdd.mockReturnValue(
      new Promise<ChecklistItem>((r) => {
        resolve = r;
      }),
    );
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText('챙길 것 추가'), '간식');
    await act(async () => {
      fireEvent(screen.getByLabelText('챙길 것 추가'), 'submitEditing');
      fireEvent.press(screen.getByLabelText('추가'));
    });
    expect(mockAdd).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(checklistItem({ id: 'snack', label: '간식' }));
    });
  });

  it('더보기로 이름을 고치면 시트가 닫히고 이름이 바뀐다', async () => {
    mockUpdate.mockResolvedValue({
      ...raincoat(),
      label: '우비 2벌',
      modifiedByUser: true,
      version: 2,
    });
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('우비 고치기'));
    expect(screen.getByText('준비물 고치기')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('준비물 이름'), '우비 2벌');
    await fireEvent.press(screen.getByText('저장'));

    expect(mockUpdate).toHaveBeenCalledWith('trip-1', 'raincoat', {
      expectedVersion: 1,
      label: '우비 2벌',
    });
    expect(await screen.findByLabelText('우비 2벌')).toBeTruthy();
    expect(screen.getByText('직접 고침')).toBeTruthy();
    expect(screen.queryByText('준비물 고치기')).toBeNull();
  });

  it('이름이 그대로면 저장해도 보내지 않는다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('우비 고치기'));
    await fireEvent.press(screen.getByText('저장'));
    expect(mockUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('준비물 고치기')).toBeNull());
  });

  it('고칠 때 다른 동행이 먼저 바꿨으면 덮어쓰지 않고 다시 받는다', async () => {
    mockUpdate.mockRejectedValue(httpError(409, 'VERSION_CONFLICT'));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('우비 고치기'));
    await fireEvent.changeText(screen.getByLabelText('준비물 이름'), '우비 2벌');
    await fireEvent.press(screen.getByText('저장'));
    await waitFor(() =>
      expect(toast.show).toHaveBeenCalledWith('다른 동행이 먼저 바꿨어요. 최신 목록을 불러왔어요'),
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('준비물 고치기')).toBeNull();
  });

  it('시트를 열어 둔 사이 목록을 다시 받아도 연 때의 version으로 보내 동행 변경을 덮지 않는다', async () => {
    mockUpdate.mockRejectedValue(httpError(409, 'VERSION_CONFLICT'));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('우비 고치기'));
    // 그 사이 다른 동행이 이름을 바꿨고, 앱으로 돌아와 목록을 다시 받았다
    await act(async () => {
      lastClient.setQueryData(checklistKey('trip-1'), (old: ChecklistItem[] | undefined) =>
        (old ?? []).map((i) =>
          i.id === 'raincoat' ? { ...i, label: '판초 우비', version: 2 } : i,
        ),
      );
    });
    await fireEvent.changeText(screen.getByLabelText('준비물 이름'), '우비 2벌');
    await fireEvent.press(screen.getByText('저장'));
    expect(mockUpdate).toHaveBeenCalledWith('trip-1', 'raincoat', {
      expectedVersion: 1,
      label: '우비 2벌',
    });
    await waitFor(() =>
      expect(toast.show).toHaveBeenCalledWith('다른 동행이 먼저 바꿨어요. 최신 목록을 불러왔어요'),
    );
  });

  it('지우기를 누르면 확인 없이 목록에서 빠진다', async () => {
    mockDelete.mockResolvedValue(undefined);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('손난로 고치기'));
    await fireEvent.press(screen.getByLabelText('지우기'));

    expect(mockDelete).toHaveBeenCalledWith('trip-1', 'warmer');
    expect(await screen.findByText('2개 중 1개 챙겼어요')).toBeTruthy();
    expect(screen.queryByLabelText('손난로')).toBeNull();
  });
});

describe('지우기 충돌', () => {
  it('다른 동행이 먼저 지운 항목을 지우면 목록에서 빼고 안내한다', async () => {
    mockDelete.mockRejectedValue(httpError(404, 'CHECKLIST_ITEM_NOT_FOUND'));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('손난로 고치기'));
    await fireEvent.press(screen.getByLabelText('지우기'));
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith('이미 지워진 준비물이에요'));
    expect(screen.queryByLabelText('손난로')).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('항목 없음', () => {
  it('목록이 비면 안내와 제안 받기, 직접 추가가 보인다', async () => {
    mockGet.mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText('준비물이 없어요')).toBeTruthy();
    expect(screen.getByText('날씨·일정 기준 준비물')).toBeTruthy();
    expect(screen.getByText('제안 받기')).toBeTruthy();
    expect(screen.queryByLabelText('챙길 것 추가')).toBeNull();
  });

  it('직접 추가를 누르면 입력이 나타나고, 첫 항목을 더하면 목록이 보인다', async () => {
    mockGet.mockResolvedValue([]);
    mockAdd.mockResolvedValue(checklistItem({ id: 'warmer', label: '손난로' }));
    await renderScreen();
    await fireEvent.press(await screen.findByText('직접 추가'));
    const input = screen.getByLabelText('챙길 것 추가');
    expect(input.props.autoFocus).toBe(true);
    await fireEvent.changeText(input, '손난로');
    await fireEvent.press(screen.getByLabelText('추가'));

    expect(await screen.findByText('1개 중 0개 챙겼어요')).toBeTruthy();
    expect(screen.queryByText('준비물이 없어요')).toBeNull();
  });

  it('마지막 항목을 지우면 항목 없음으로 바뀐다', async () => {
    mockGet.mockResolvedValue([warmer()]);
    mockDelete.mockResolvedValue(undefined);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('손난로 고치기'));
    await fireEvent.press(screen.getByLabelText('지우기'));
    expect(await screen.findByText('준비물이 없어요')).toBeTruthy();
  });
});

describe('다시 제안 받기', () => {
  it('받는 동안 버튼이 바뀌어 다시 눌리지 않는다', async () => {
    mockRequest.mockReturnValue(new Promise<JobRef>(() => {}));
    await renderScreen();
    await fireEvent.press(await screen.findByText('다시 제안 받기'));
    expect(await screen.findByText('제안 받는 중…')).toBeTruthy();
    await fireEvent.press(screen.getByText('제안 받는 중…'));
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('끝나면 새 제안을 이유와 함께 목록 끝에 더한다', async () => {
    mockRequest.mockResolvedValue(REF);
    mockJob.mockResolvedValue(
      suggestionJob({
        status: 'SUCCEEDED',
        result: { items: [suggestion('우비'), suggestion('선크림', '자외선 강함')] },
      }),
    );
    mockAdopt.mockResolvedValue(
      checklistItem({ id: 'sun', label: '선크림', source: 'AI', reason: '자외선 강함' }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByText('다시 제안 받기'));

    expect(await screen.findByText('4개 중 1개 챙겼어요')).toBeTruthy();
    expect(screen.getByText('자외선 강함')).toBeTruthy();
    expect(mockAdopt).toHaveBeenCalledWith('trip-1', {
      label: '선크림',
      sourceJobId: 'job-1',
      suggestionIndex: 1,
    });
    expect(toast.success).toHaveBeenCalledWith('준비물 1개를 더했어요');
  });

  it('실패하면 목록은 그대로 두고 카드와 다시 시도를 보인다', async () => {
    mockRequest.mockResolvedValue(REF);
    mockJob.mockResolvedValueOnce(suggestionJob({ status: 'FAILED' }));
    await renderScreen();
    await fireEvent.press(await screen.findByText('다시 제안 받기'));

    expect(
      await screen.findByLabelText('준비물을 다시 제안하지 못했어요. 지금 목록은 그대로예요'),
    ).toBeTruthy();
    expect(screen.queryByText('지금 목록은 그대로예요')).toBeNull();
    expect(screen.getByText('직접 고친 항목은 그대로 둬요')).toBeTruthy();
    expect(screen.getByText('3개 중 1개 챙겼어요')).toBeTruthy();

    mockJob.mockResolvedValue(suggestionJob({ status: 'SUCCEEDED', result: { items: [] } }));
    await fireEvent.press(screen.getByText('다시 시도'));
    await waitFor(() =>
      expect(screen.queryByLabelText(/준비물을 다시 제안하지 못했어요/)).toBeNull(),
    );
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('추천이 꺼져 있으면 설정 열기로 안내한다', async () => {
    mockRequest.mockRejectedValue(httpError(409, 'AI_FEATURE_DISABLED'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('다시 제안 받기'));
    expect(await screen.findByLabelText(/준비물 추천이 꺼져 있어요/)).toBeTruthy();
    await fireEvent.press(screen.getByText('설정 열기'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
  });

  it('빈 상태의 제안 받기도 받는 동안 제안 받는 중…으로 바뀐다', async () => {
    mockGet.mockResolvedValue([]);
    mockRequest.mockReturnValue(new Promise<JobRef>(() => {}));
    await renderScreen();
    await fireEvent.press(await screen.findByText('제안 받기'));
    expect(await screen.findByText('제안 받는 중…')).toBeTruthy();
    await fireEvent.press(screen.getByText('제안 받는 중…'));
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('빈 상태의 제안 받기도 같은 제안을 시작한다', async () => {
    mockGet.mockResolvedValue([]);
    mockRequest.mockResolvedValue(REF);
    mockJob.mockResolvedValue(
      suggestionJob({
        status: 'SUCCEEDED',
        result: { items: [suggestion('우산', '오전 비 70%')] },
      }),
    );
    mockAdopt.mockResolvedValue(
      checklistItem({ id: 'u', label: '우산', source: 'AI', reason: '오전 비 70%' }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByText('제안 받기'));
    expect(await screen.findByText('1개 중 0개 챙겼어요')).toBeTruthy();
  });
});
