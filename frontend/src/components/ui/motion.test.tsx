import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Animated, Text } from 'react-native';

import { setReduceMotionForTest } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/motion';

import { Button } from './button';
import { CheckMarkWhen } from './check-mark';
import { Popup } from './popup';
import { usePressScale } from './use-press-scale';

/** 움직임 기준값과 공통 움직임 부품(2026-11-11 사용자 결정) */

const valueOf = (v: Animated.Value) => (v as unknown as { __getValue(): number }).__getValue();

beforeEach(() => {
  jest.useFakeTimers();
  setReduceMotionForTest(false);
});

afterEach(() => {
  jest.useRealTimers();
  setReduceMotionForTest(false);
});

describe('움직임 기준값', () => {
  it('빠르기는 빠름 120, 보통 200, 느림 300이다', () => {
    expect(motion.duration).toEqual({ fast: 120, normal: 200, slow: 300 });
  });

  it('버튼 눌림 0.96배, 체크 220ms, 팝업 0.92배에서 180ms다', () => {
    expect(motion.press.scale).toBe(0.96);
    expect(motion.check.duration).toBe(220);
    expect(motion.popup).toEqual({ fromScale: 0.92, duration: 180 });
  });
});

describe('usePressScale', () => {
  // 크기 움직임은 화면 그리는 쪽에서 돌아 테스트에서 값을 읽을 수 없다. 어떤 움직임을 시작하는지를 본다
  it('누르면 0.96배로 줄이고 손을 떼면 스프링으로 1배로 돌린다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const spring = jest.spyOn(Animated, 'spring');
    const { result } = await renderHook(() => usePressScale());
    await act(async () => {
      result.current.onPressIn();
    });
    expect(timing).toHaveBeenCalledWith(
      result.current.scale,
      expect.objectContaining({ toValue: 0.96, duration: motion.duration.fast }),
    );
    await act(async () => {
      result.current.onPressOut();
    });
    expect(spring).toHaveBeenCalledWith(
      result.current.scale,
      expect.objectContaining({ toValue: 1 }),
    );
    timing.mockRestore();
    spring.mockRestore();
  });

  it('동작 줄이기가 켜져 있으면 움직임을 시작하지 않는다', async () => {
    setReduceMotionForTest(true);
    const timing = jest.spyOn(Animated, 'timing');
    const spring = jest.spyOn(Animated, 'spring');
    const { result } = await renderHook(() => usePressScale());
    await act(async () => {
      result.current.onPressIn();
      result.current.onPressOut();
    });
    expect(timing).not.toHaveBeenCalled();
    expect(spring).not.toHaveBeenCalled();
    expect(valueOf(result.current.scale)).toBe(1);
    timing.mockRestore();
    spring.mockRestore();
  });
});

describe('Button', () => {
  it('눌림 움직임을 넣어도 누르면 onPress가 한 번 불린다', async () => {
    const onPress = jest.fn();
    await render(<Button label="저장" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('기다리는 동안에는 글자 대신 돌아가는 표시가 보이고 눌리지 않는다', async () => {
    const onPress = jest.fn();
    await render(<Button label="저장" onPress={onPress} loading />);
    expect(screen.queryByText('저장')).toBeNull();
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('CheckMarkWhen', () => {
  it('체크돼 있지 않으면 아무것도 그리지 않는다', async () => {
    await render(<CheckMarkWhen checked={false} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('체크하면 체크를 그리고, 풀면 다시 사라진다', async () => {
    const view = await render(<CheckMarkWhen checked={false} />);
    await view.rerender(<CheckMarkWhen checked />);
    expect(screen.toJSON()).not.toBeNull();
    await view.rerender(<CheckMarkWhen checked={false} />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe('Popup', () => {
  it('보일 때만 내용을 그린다', async () => {
    const view = await render(
      <Popup visible={false} onRequestClose={() => undefined}>
        <Text>내용</Text>
      </Popup>,
    );
    expect(screen.queryByText('내용')).toBeNull();
    await view.rerender(
      <Popup visible onRequestClose={() => undefined}>
        <Text>내용</Text>
      </Popup>,
    );
    expect(screen.getByText('내용')).toBeTruthy();
  });

  it('바탕 누르기를 주면 카드 밖을 눌러 닫을 수 있다', async () => {
    const onBackdropPress = jest.fn();
    await render(
      <Popup
        visible
        onRequestClose={() => undefined}
        onBackdropPress={onBackdropPress}
        backdropLabel="알림 닫기"
      >
        <Text>내용</Text>
      </Popup>,
    );
    await fireEvent.press(screen.getByLabelText('알림 닫기'));
    expect(onBackdropPress).toHaveBeenCalledTimes(1);
  });
});
