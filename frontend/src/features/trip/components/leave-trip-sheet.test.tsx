import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { LeaveTripSheet } from './leave-trip-sheet';

// 하단 시트는 네이티브 애니메이션이 필요해 테스트에서는 내용과 버튼만 그대로 그린다
jest.mock('@/components/ui', () => {
  // 하단 시트 모듈(@gorhom/bottom-sheet)은 불러오지 않고, 쓰는 부품만 실제로 가져온다
  const { Icon } =
    jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { RoundCheck } = jest.requireActual<typeof import('@/components/ui/round-check')>(
    '@/components/ui/round-check',
  );
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon,
    RoundCheck,
    ConfirmSheet: ({
      visible,
      title,
      confirmLabel,
      onConfirm,
      children,
    }: {
      visible: boolean;
      title: string;
      confirmLabel: string;
      onConfirm: () => void;
      children?: ReactNode;
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          {children}
          <Pressable accessibilityRole="button" onPress={onConfirm}>
            <Text>{confirmLabel}</Text>
          </Pressable>
        </View>
      ) : null,
  };
});

const onConfirm = jest.fn();
const base = { visible: true, onClose: jest.fn(), onConfirm, tripTitle: '겨울 여행' };

beforeEach(() => {
  onConfirm.mockReset();
});

describe('LeaveTripSheet', () => {
  it('사진 줄은 기본으로 숨긴다', async () => {
    await render(<LeaveTripSheet {...base} />);
    expect(screen.queryByText('사진')).toBeNull();
    expect(screen.getByText('경비 기록은 남아요')).toBeTruthy();
  });

  it('채팅 체크를 켜고 나가면 메시지만 지운다', async () => {
    await render(<LeaveTripSheet {...base} />);
    await fireEvent.press(screen.getByLabelText('내가 보낸 메시지도 지우기'));
    await fireEvent.press(screen.getByText('나가기'));
    expect(onConfirm).toHaveBeenCalledWith({ deleteOwnPhotos: false, deleteOwnMessages: true });
  });

  it('체크하지 않으면 아무것도 지우지 않는다', async () => {
    await render(<LeaveTripSheet {...base} />);
    await fireEvent.press(screen.getByText('나가기'));
    expect(onConfirm).toHaveBeenCalledWith({ deleteOwnPhotos: false, deleteOwnMessages: false });
  });

  it('혼자 남았으면 체크가 없고 버튼은 "나가기"다', async () => {
    await render(<LeaveTripSheet {...base} alone />);
    expect(screen.queryByLabelText('내가 보낸 메시지도 지우기')).toBeNull();
    expect(screen.getByText('혼자 남아서 나가면 여행이 삭제돼요')).toBeTruthy();
    expect(screen.getByText('겨울 여행의 기록이 모두 지워져요. 되돌릴 수 없어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('나가기'));
    expect(onConfirm).toHaveBeenCalledWith({ deleteOwnPhotos: false, deleteOwnMessages: false });
  });

  it('방장이면 이어받을 사람과 넘기기 링크를 보인다', async () => {
    const onHandOver = jest.fn();
    await render(<LeaveTripSheet {...base} nextOwnerName="세은" onHandOver={onHandOver} />);
    expect(screen.getByText(/나가면 세은님이 방장이 돼요/)).toBeTruthy();
    await fireEvent.press(screen.getByText('다른 사람에게 넘기기'));
    expect(onHandOver).toHaveBeenCalled();
  });
});
