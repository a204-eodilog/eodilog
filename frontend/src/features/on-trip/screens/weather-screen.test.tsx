import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';
import { getAutoCourse, getItinerary, getJob } from '@/features/course/api';
import { sampleCourse } from '@/features/course/testing';
import type { ItineraryProposal, Job } from '@/features/course/types';

import {
  addChecklistItem,
  getWeather,
  requestWeatherAlternatives,
  requestWeatherProposal,
} from '../api';
import { alternativesResult, weather } from '../testing';

import { WeatherScreen } from './weather-screen';

const mockParams = { tripId: 'trip-1', date: '2026-11-14', placeId: 'p-haeundae' };
const PARAMS = { ...mockParams };

jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1' }));
jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  // jest.mock은 위로 끌어올려져 mockRouter가 만들어지기 전에 불릴 수 있어 꺼낼 때 읽는다
  get router() {
    return mockRouter;
  },
}));
jest.mock('@/features/course/api', () => ({
  getItinerary: jest.fn(),
  getJob: jest.fn(),
  getAutoCourse: jest.fn(),
}));
jest.mock('../api', () => ({
  getWeather: jest.fn(),
  requestWeatherAlternatives: jest.fn(),
  requestWeatherProposal: jest.fn(),
  addChecklistItem: jest.fn(),
}));
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
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon: actual.Icon,
    Header: ({ title }: { title?: string }) => <Text>{title}</Text>,
    AvatarGroup: () => null,
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
    BottomSheet: ({
      visible,
      title,
      children,
    }: {
      visible: boolean;
      title?: string;
      children?: ReactNode;
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          {children}
        </View>
      ) : null,
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

jest.setTimeout(20_000);

const mockItinerary = jest.mocked(getItinerary);
const mockJob = jest.mocked(getJob);
const mockProposal = jest.mocked(getAutoCourse);
const mockWeather = jest.mocked(getWeather);
const mockRequest = jest.mocked(requestWeatherAlternatives);
const mockPropose = jest.mocked(requestWeatherProposal);
const mockAdd = jest.mocked(addChecklistItem);

const job = (status: Job['status'], result: unknown = null): Job => ({
  id: 'job-w',
  kind: 'WEATHER_ALTERNATIVES',
  status,
  progress: 0,
  result,
  error: null,
  createdAt: '',
  finishedAt: null,
});
const proposalOf = (status: Job['status']) =>
  ({
    job: job(status),
    baseVersion: 3,
    reason: 'WEATHER',
    proposed: null,
    diff: null,
    appliedAt: null,
    canUndo: false,
  }) as ItineraryProposal;

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
        <WeatherScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockParams, PARAMS);
  mockItinerary.mockResolvedValue(sampleCourse(true));
  mockWeather.mockReset();
  mockWeather.mockResolvedValue(weather());
  mockRequest.mockResolvedValue({ jobId: 'job-w', status: 'QUEUED', statusUrl: '' });
  mockJob.mockReset();
  mockJob.mockResolvedValue(job('SUCCEEDED', alternativesResult()));
  mockPropose.mockResolvedValue({ jobId: 'job-p', status: 'QUEUED', statusUrl: '' });
  mockProposal.mockResolvedValue(proposalOf('SUCCEEDED'));
  mockAdd.mockResolvedValue(undefined);
});

describe('S26 날씨 대안', () => {
  it('날씨, 영향 받는 일정, 대안을 보이고 고른 대안으로 변경안을 만든다', async () => {
    await renderScreen();
    expect(await screen.findByText('해운대 실내 수족관')).toBeTruthy();
    expect(screen.getByText('오전 비 70% · 12시부터 그쳐요')).toBeTruthy();
    expect(screen.getByText('11.14(토) 09:40 조회')).toBeTruthy();
    expect(screen.getByText('비 오는 시간 일정이에요')).toBeTruthy();
    expect(screen.getByText('해운대 해변 근처')).toBeTruthy();
    expect(screen.getByText('해운대 해변을 오후로 옮기기')).toBeTruthy();
    expect(mockRequest).toHaveBeenCalledWith('trip-1', {
      date: '2026-11-14',
      placeId: 'p-haeundae',
      expectedVersion: 3,
    });
    const make = screen.getByRole('button', { name: '변경안 만들기' });
    expect(make.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole('radio', { name: '해운대 실내 수족관' }));
    await fireEvent.press(screen.getByText('변경안 만들기'));
    expect(await screen.findByText('변경안을 만들었어요')).toBeTruthy();
    expect(mockPropose).toHaveBeenCalledWith(
      'trip-1',
      { expectedVersion: 3, sourceWeatherJobId: 'job-w', selectedAlternativeId: 'alt-2' },
      expect.any(String),
    );
    expect(screen.getByText('1일차 오전 일정')).toBeTruthy();
    expect(screen.getAllByText('해운대 실내 수족관').length).toBeGreaterThan(1);
    expect(screen.getByText('적용 전까지 지금 코스는 그대로예요')).toBeTruthy();
    await fireEvent.press(screen.getByText('닫기'));
    expect(screen.queryByText('변경안을 만들었어요')).toBeNull();
  });

  it('변경안 보기는 만든 변경안의 AI 변경안 화면을 연다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByRole('radio', { name: '해운대 실내 수족관' }));
    await fireEvent.press(screen.getByText('변경안 만들기'));
    await fireEvent.press(await screen.findByText('변경안 보기'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/proposal',
      params: { tripId: 'trip-1', jobId: 'job-p' },
    });
    expect(screen.queryByText('변경안을 만들었어요')).toBeNull();
  });

  it('안내 대안은 고를 수 없다', async () => {
    await renderScreen();
    const info = await screen.findByRole('radio', { name: '우산을 챙겨요' });
    expect(info.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('대안이 없으면 우산과 우비를 준비물에 넣는다', async () => {
    mockJob.mockResolvedValue(job('SUCCEEDED', alternativesResult({ alternatives: [] })));
    await renderScreen();
    expect(await screen.findByText('가까운 실내 대안이 없어요')).toBeTruthy();
    expect(screen.queryByText('변경안 만들기')).toBeNull();
    await fireEvent.press(screen.getByText('준비물에 넣기'));
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2));
    expect(mockAdd).toHaveBeenNthCalledWith(1, 'trip-1', '우산');
    expect(mockAdd).toHaveBeenNthCalledWith(2, 'trip-1', '우비');
    expect(toast.success).toHaveBeenCalledWith('우산과 우비를 준비물에 넣었어요');
    expect(await screen.findByText('준비물에 넣었어요')).toBeTruthy();
  });

  it('날씨를 새로 받지 못해도 마지막 날씨와 대안은 남는다', async () => {
    mockWeather.mockRejectedValue(new Error('503'));
    await renderScreen();
    expect(await screen.findByText('날씨를 새로 불러오지 못했어요')).toBeTruthy();
    expect(await screen.findByText('마지막 조회 11.14(토) 09:40')).toBeTruthy();
    expect(screen.getByText('해운대 실내 수족관')).toBeTruthy();
    expect(screen.getByText('다시 시도')).toBeTruthy();
  });

  it('대안을 만들지 못하면 다시 시도로 다시 만든다', async () => {
    mockJob.mockResolvedValueOnce(job('FAILED'));
    await renderScreen();
    expect(await screen.findByText('날씨 대안을 만들지 못했어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('다시 시도'));
    expect(await screen.findByText('해운대 실내 수족관')).toBeTruthy();
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('볼 장소 없이 열리면 계속 기다리지 않고 장소가 없다고 알린다', async () => {
    mockParams.placeId = '';
    await renderScreen();
    expect(await screen.findByText('날씨 대안을 찾을 장소가 없어요')).toBeTruthy();
    expect(screen.queryByText('날씨 대안을 찾고 있어요')).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('코스를 받지 못하면 계속 기다리지 않고 다시 시도로 다시 받는다', async () => {
    mockItinerary.mockRejectedValueOnce(new Error('500')).mockRejectedValueOnce(new Error('500'));
    await renderScreen();
    expect(await screen.findByText('코스를 불러오지 못했어요', {}, { timeout: 5000 })).toBeTruthy();
    await fireEvent.press(screen.getByText('다시 시도'));
    expect(await screen.findByText('해운대 실내 수족관')).toBeTruthy();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('변경안을 만들지 못하면 알리고 시트는 뜨지 않는다', async () => {
    mockProposal.mockResolvedValue(proposalOf('FAILED'));
    await renderScreen();
    await fireEvent.press(await screen.findByRole('radio', { name: '해운대 실내 수족관' }));
    await fireEvent.press(screen.getByText('변경안 만들기'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('변경안을 만들지 못했어요. 다시 시도해 주세요'),
    );
    expect(screen.queryByText('변경안을 만들었어요')).toBeNull();
  });
});
