import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';
import { getAutoCourse, getItinerary } from '@/features/course/api';
import { httpError, sampleCourse } from '@/features/course/testing';

import { applyProposal, requestRemoval } from '../api';
import { job, proposal } from '../testing';

import { ProposalScreen } from './proposal-screen';

const mockParams: { tripId: string; jobId?: string; removePlaceId?: string } = {
  tripId: 'trip-1',
  removePlaceId: 'p-gwangalli',
};
const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn() };

let mockKeySeq = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKeySeq}` }));
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
jest.mock('@/features/course/api', () => ({ getAutoCourse: jest.fn(), getItinerary: jest.fn() }));
jest.mock('../api', () => ({ requestRemoval: jest.fn(), applyProposal: jest.fn() }));
jest.mock('@/features/course/components/course-map', () => ({ CourseMap: () => null }));
jest.mock('@/features/trip/hooks/use-trip', () => ({
  tripKey: (id: string) => ['trips', id],
  useTrip: () => ({
    data: {
      id: 'trip-1',
      title: '겨울 여행',
      startDate: '2026-11-14',
      endDate: '2026-11-15',
      members: [],
    },
  }),
}));
jest.mock('@/hooks/use-me', () => ({ useMe: () => ({ data: { id: 'u-me' } }) }));
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon: actual.Icon,
    Header: ({ title }: { title?: string }) => <Text>{title}</Text>,
    AvatarGroup: () => null,
    Button: ({ label, onPress }: { label: string; onPress?: () => void; leading?: ReactNode }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{label}</Text>
      </Pressable>
    ),
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

jest.setTimeout(20_000);

const mockGet = jest.mocked(getAutoCourse);
const mockItinerary = jest.mocked(getItinerary);
const mockRemove = jest.mocked(requestRemoval);
const mockApply = jest.mocked(applyProposal);

/** 지금 백엔드가 장소 빼기를 거절하는 응답(400 VALIDATION_ERROR, reason 칸) */
function reasonRejected(): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return new AxiosError('VALIDATION_ERROR', 'ERR_BAD_REQUEST', config, null, {
    status: 400,
    statusText: 'VALIDATION_ERROR',
    headers: {},
    config,
    data: {
      error: {
        code: 'VALIDATION_ERROR',
        message: '입력값을 확인해 주세요.',
        fields: [{ field: 'reason', message: '아직 지원하지 않는 사유입니다.' }],
        traceId: null,
      },
    },
  });
}

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const metrics = {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  };
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <ProposalScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.jobId = undefined;
  mockParams.removePlaceId = 'p-gwangalli';
  mockItinerary.mockResolvedValue(sampleCourse(true));
  mockRemove.mockResolvedValue({ jobId: 'job-p', status: 'QUEUED', statusUrl: '' });
  mockGet.mockReset();
  mockGet.mockResolvedValue(proposal());
  mockApply.mockReset();
  mockApply.mockResolvedValue({ ...sampleCourse(true), version: 4 });
});

describe('S29 비교', () => {
  it('장소를 뺀 변경안을 만들어 바뀐 날을 비교한다', async () => {
    await renderScreen();
    expect(await screen.findByText('광안리 바다뷰 카페를 빼요')).toBeTruthy();
    expect(mockRemove).toHaveBeenCalledWith('trip-1', 3, 'p-gwangalli', expect.any(String));
    expect(screen.getByText('1일차 2번째 장소')).toBeTruthy();
    expect(screen.getByText('2곳')).toBeTruthy();
    expect(screen.getByText('기존 3곳')).toBeTruthy();
    expect(screen.getByText('계산 전')).toBeTruthy();
    expect(screen.getByText('기존 47분')).toBeTruthy();
    expect(screen.getByText('기존 19:00')).toBeTruthy();
    expect(screen.getByText('대중교통 기준 · 11.14(토) 12:05 계산')).toBeTruthy();
    expect(screen.getByText('그대로')).toBeTruthy();
    expect(screen.getByText('당겨짐')).toBeTruthy();
    expect(screen.getByText('바뀜')).toBeTruthy();
    expect(screen.getByText('빠짐')).toBeTruthy();
    expect(screen.getByText('광안리 바다뷰 카페')).toBeTruthy();
  });

  it('적용하면 기준 version으로 적용하고 코스로 가서 되돌리기를 띄운다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('적용'));
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith('trip-1', 'job-p', 3));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/trips/trip-1/course?applied=job-p'),
    );
  });

  it('적용 안 함은 돌아간다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('적용 안 함'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('날씨 변경안은 작업 번호로 열어 바꿔요를 보인다', async () => {
    mockParams.removePlaceId = undefined;
    mockParams.jobId = 'job-w';
    const course = sampleCourse(true);
    mockGet.mockResolvedValue(
      proposal({
        reason: 'WEATHER',
        proposed: {
          items: course.items.map((i) =>
            i.id === 'i1'
              ? { ...i, place: { ...i.place, id: 'p-aqua', name: '해운대 실내 수족관' } }
              : i,
          ),
          legs: [
            { day: 1, fromOrder: 1, toOrder: 2, transportMode: 'TRANSIT' },
            { day: 1, fromOrder: 2, toOrder: 3, transportMode: 'TRANSIT' },
          ],
        },
      }),
    );
    await renderScreen();
    expect(await screen.findByText('해운대 해변을 해운대 실내 수족관으로 바꿔요')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(screen.getByText('새로')).toBeTruthy();
  });
});

describe('실패와 충돌', () => {
  it('작업이 실패하면 재계산 실패, 다시 시도로 다시 만든다', async () => {
    mockGet.mockResolvedValueOnce(proposal({ job: job('FAILED'), proposed: null }));
    await renderScreen();
    expect(await screen.findByText('동선을 다시 짜지 못했어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('다시 시도'));
    expect(await screen.findByText('광안리 바다뷰 카페를 빼요')).toBeTruthy();
    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  it('서버가 장소 빼기를 아직 받지 않으면 다시 시도 대신 코스 편집으로 안내한다', async () => {
    mockRemove.mockRejectedValueOnce(reasonRejected());
    await renderScreen();
    expect(await screen.findByText('아직 AI로 장소를 뺄 수 없어요')).toBeTruthy();
    expect(screen.queryByText('다시 시도')).toBeNull();
    await fireEvent.press(screen.getByText('코스 편집'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/trips/trip-1/course/edit');
  });

  it('재계산 실패의 코스 보기는 코스로', async () => {
    mockGet.mockResolvedValueOnce(proposal({ job: job('FAILED'), proposed: null }));
    await renderScreen();
    await fireEvent.press(await screen.findByText('코스 보기'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/trips/trip-1/course');
  });

  it('적용 충돌이면 안내와 다시 만들기', async () => {
    mockApply.mockRejectedValueOnce(httpError(409, 'VERSION_CONFLICT'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('적용'));
    expect(await screen.findByText('그 사이 코스가 바뀌어 적용하지 못했어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('다시 만들기'));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledTimes(2));
  });

  it('넣을 수 없는 대안은 안내만', async () => {
    mockApply.mockRejectedValueOnce(httpError(422, 'UNSCHEDULABLE_ALTERNATIVE'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('적용'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('이 대안은 코스에 넣을 수 없어요'),
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
