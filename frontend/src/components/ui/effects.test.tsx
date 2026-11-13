import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Animated, Text } from 'react-native';

import { setReduceMotionForTest } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/motion';

import { CelebrateHost, celebrate } from './celebrate';
import { CountUp } from './count-up';
import { FadeIn, appearDelay } from './fade-in';
import { Pop } from './pop';
import { PressableScale } from './pressable-scale';
import { ProgressBar } from './progress-bar';
import { SkeletonList } from './skeleton';

/** 앱 전체 움직임 부품(2026-11-12). 어떤 움직임을 시작하는지와 "동작 줄이기"에서의 모습을 본다 */

beforeEach(() => {
  jest.useFakeTimers();
  setReduceMotionForTest(false);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  setReduceMotionForTest(false);
});

describe('PressableScale', () => {
  it('누르는 동안 모양을 바꾸는 스타일을 눌림 상태로 풀어 준다', async () => {
    await render(
      <PressableScale testID="p" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <Text>줄</Text>
      </PressableScale>,
    );
    expect(screen.getByTestId('p')).toHaveStyle({ opacity: 1 });
    await act(async () => {
      fireEvent(screen.getByTestId('p'), 'pressIn');
    });
    expect(screen.getByTestId('p')).toHaveStyle({ opacity: 0.6 });
    await act(async () => {
      fireEvent(screen.getByTestId('p'), 'pressOut');
    });
    expect(screen.getByTestId('p')).toHaveStyle({ opacity: 1 });
  });

  it('좁은 칸은 0.96배, 넓은 칸은 0.98배로 줄인다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await render(
      <PressableScale testID="p">
        <Text>줄</Text>
      </PressableScale>,
    );
    await act(async () => {
      fireEvent(screen.getByTestId('p'), 'pressIn');
    });
    expect(timing).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: motion.press.scale }),
    );
    await act(async () => {
      fireEvent(screen.getByTestId('p'), 'pressIn', {
        currentTarget: { getBoundingClientRect: () => ({ width: 320 }) },
      });
    });
    expect(timing).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: motion.press.wideScale }),
    );
  });

  it('부르는 쪽의 onPressIn·onPressOut도 부른다', async () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    await render(
      <PressableScale testID="p" onPressIn={onPressIn} onPressOut={onPressOut}>
        <Text>줄</Text>
      </PressableScale>,
    );
    await act(async () => {
      fireEvent(screen.getByTestId('p'), 'pressIn');
      fireEvent(screen.getByTestId('p'), 'pressOut');
    });
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });
});

describe('SkeletonList', () => {
  it('줄 수만큼 그리고 불러오는 중으로 읽힌다', async () => {
    await render(<SkeletonList count={4} />);
    expect(screen.getAllByTestId('skeleton-item')).toHaveLength(4);
    expect(screen.getByRole('progressbar')).toHaveProp('accessibilityLabel', '불러오는 중');
  });

  it('깜빡임을 되풀이한다', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    await render(<SkeletonList />);
    expect(loop).toHaveBeenCalledTimes(1);
  });

  it('동작 줄이기가 켜져 있으면 깜빡이지 않는다', async () => {
    setReduceMotionForTest(true);
    const loop = jest.spyOn(Animated, 'loop');
    await render(<SkeletonList />);
    expect(loop).not.toHaveBeenCalled();
  });
});

describe('FadeIn', () => {
  it('하나마다 45ms씩 늦추고 6번째 뒤로는 더 늦추지 않는다', () => {
    expect(appearDelay(0)).toBe(0);
    expect(appearDelay(3)).toBe(135);
    expect(appearDelay(6)).toBe(270);
    expect(appearDelay(40)).toBe(270);
    expect(appearDelay(-1)).toBe(0);
  });

  it('큰 제목은 가려진 틀 안에서 솟아오르고 글은 한 덩어리로 남는다', async () => {
    await render(
      <FadeIn from="mask">
        <Text>부산 바다 여행</Text>
      </FadeIn>,
    );
    expect(screen.getByText('부산 바다 여행')).toBeTruthy();
  });

  it.each(['up', 'left', 'right', 'pop', 'mask'] as const)(
    '%s 방향으로도 그려진다',
    async (from) => {
      await render(
        <FadeIn from={from}>
          <Text>칸</Text>
        </FadeIn>,
      );
      expect(screen.getByText('칸')).toBeTruthy();
    },
  );

  it('순서만큼 늦게 360ms 동안 나타난다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await render(
      <FadeIn index={2}>
        <Text>줄</Text>
      </FadeIn>,
    );
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, delay: 90, duration: motion.appear.duration }),
    );
  });

  it('동작 줄이기가 켜져 있으면 움직임을 시작하지 않는다', async () => {
    setReduceMotionForTest(true);
    const timing = jest.spyOn(Animated, 'timing');
    await render(
      <FadeIn>
        <Text>줄</Text>
      </FadeIn>,
    );
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByText('줄')).toBeTruthy();
  });
});

describe('ProgressBar', () => {
  it('처음에는 움직이지 않고 그 비율로 읽힌다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await render(<ProgressBar ratio={0.5} />);
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toHaveProp('accessibilityValue', {
      min: 0,
      max: 100,
      now: 50,
    });
  });

  it('비율이 바뀌면 300ms 동안 움직인다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const view = await render(<ProgressBar ratio={0.2} />);
    await view.rerender(<ProgressBar ratio={0.8} />);
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0.8, duration: motion.duration.slow }),
    );
  });

  it('동작 줄이기가 켜져 있으면 움직이지 않고, 범위를 벗어난 값은 0과 1 사이로 맞춘다', async () => {
    setReduceMotionForTest(true);
    const timing = jest.spyOn(Animated, 'timing');
    const view = await render(<ProgressBar ratio={0.2} />);
    await view.rerender(<ProgressBar ratio={3} />);
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toHaveProp('accessibilityValue', {
      min: 0,
      max: 100,
      now: 100,
    });
  });
});

describe('CountUp', () => {
  it('처음에는 바로 그 수가 보인다', async () => {
    await render(<CountUp value={3} format={(n) => `${n}표`} />);
    expect(screen.getByText('3표')).toBeTruthy();
  });

  it('값이 바뀌면 끝에 새 수가 된다', async () => {
    const view = await render(<CountUp value={3} />);
    await view.rerender(<CountUp value={10} />);
    await act(async () => {
      jest.advanceTimersByTime(motion.duration.slow + 50);
    });
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('동작 줄이기가 켜져 있으면 세지 않고 바뀐다', async () => {
    setReduceMotionForTest(true);
    const timing = jest.spyOn(Animated, 'timing');
    const view = await render(<CountUp value={3} />);
    await view.rerender(<CountUp value={10} />);
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 10, duration: 0 }),
    );
    await act(async () => {
      jest.advanceTimersByTime(20);
    });
    expect(screen.getByText('10')).toBeTruthy();
  });
});

describe('Pop', () => {
  const badge = (n: number) => (
    <Pop trigger={n}>
      <Text>{n}</Text>
    </Pop>
  );

  it('처음에는 튀지 않고 값이 바뀌면 튄다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const view = await render(badge(1));
    expect(timing).not.toHaveBeenCalled();
    await view.rerender(badge(2));
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: motion.pop.toScale }),
    );
  });

  it('동작 줄이기가 켜져 있으면 튀지 않는다', async () => {
    setReduceMotionForTest(true);
    const timing = jest.spyOn(Animated, 'timing');
    const view = await render(badge(1));
    await view.rerender(badge(2));
    expect(timing).not.toHaveBeenCalled();
  });
});

describe('celebrate', () => {
  it('부르면 조각이 보이고 끝나면 사라진다', async () => {
    await render(<CelebrateHost />);
    expect(screen.queryByTestId('celebrate')).toBeNull();
    await act(async () => {
      celebrate();
    });
    expect(screen.getByTestId('celebrate').children).toHaveLength(motion.celebrate.pieces);
    expect(screen.getByTestId('celebrate')).toHaveProp('pointerEvents', 'none');
    await act(async () => {
      jest.advanceTimersByTime(motion.celebrate.duration + 100);
    });
    expect(screen.queryByTestId('celebrate')).toBeNull();
  });

  it('동작 줄이기가 켜져 있으면 나오지 않는다', async () => {
    setReduceMotionForTest(true);
    await render(<CelebrateHost />);
    await act(async () => {
      celebrate();
    });
    expect(screen.queryByTestId('celebrate')).toBeNull();
  });
});
