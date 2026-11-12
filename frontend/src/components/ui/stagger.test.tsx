import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Animated, Text } from 'react-native';

import { setReduceMotionForTest } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/motion';

import { Stagger } from './stagger';

/** 순서대로 나오는 글: 제목 → 설명 → 내용이 60ms 간격으로 한 줄씩 나타난다 */

beforeEach(() => {
  setReduceMotionForTest(false);
});

afterEach(() => {
  setReduceMotionForTest(false);
  jest.restoreAllMocks();
});

describe('Stagger', () => {
  it('줄마다 60ms씩 늦게 나타나기 시작한다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await render(
      <Stagger>
        <Text>제목</Text>
        <Text>설명</Text>
        <Text>내용</Text>
      </Stagger>,
    );
    const delays = timing.mock.calls.map((call) => call[1].delay);
    expect(delays).toEqual([0, 60, 120]);
    expect(timing.mock.calls[0][1]).toEqual(
      expect.objectContaining({ toValue: 1, duration: motion.appear.duration }),
    );
    expect(screen.getByText('제목')).toBeTruthy();
    expect(screen.getByText('내용')).toBeTruthy();
  });

  it('빈 줄은 건너뛰어 간격이 비지 않는다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const description: string | null = null;
    await render(
      <Stagger>
        <Text>제목</Text>
        {description ? <Text>{description}</Text> : null}
        <Text>내용</Text>
      </Stagger>,
    );
    expect(timing.mock.calls.map((call) => call[1].delay)).toEqual([0, 60]);
  });

  it('active가 false면 기다리고, true가 되면 나타나기 시작한다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const view = await render(
      <Stagger active={false}>
        <Text>제목</Text>
      </Stagger>,
    );
    expect(timing).not.toHaveBeenCalled();
    await view.rerender(
      <Stagger active>
        <Text>제목</Text>
      </Stagger>,
    );
    expect(timing).toHaveBeenCalledTimes(1);
  });

  it('동작 줄이기가 켜져 있으면 움직임 없이 바로 보인다', async () => {
    setReduceMotionForTest(true);
    const timing = jest.spyOn(Animated, 'timing');
    await render(
      <Stagger>
        <Text>제목</Text>
      </Stagger>,
    );
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByText('제목')).toBeTruthy();
  });

  it('8번째 뒤로는 더 늦추지 않는다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await render(
      <Stagger>
        {Array.from({ length: 11 }, (_, i) => (
          <Text key={i}>{`구역 ${i}`}</Text>
        ))}
      </Stagger>,
    );
    const delays = timing.mock.calls.map((call) => call[1].delay);
    expect(delays.slice(0, 3)).toEqual([0, 60, 120]);
    expect(delays.slice(8)).toEqual([480, 480, 480]);
  });

  it('위에 줄이 나중에 생겨도 아래 줄은 다시 나타나지 않는다', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const page = (notice: boolean) => (
      <Stagger>
        {notice ? <Text>안내</Text> : null}
        <Text>제목</Text>
        <Text>내용</Text>
      </Stagger>
    );
    const view = await render(page(false));
    expect(timing).toHaveBeenCalledTimes(2);
    await view.rerender(page(true));
    // 새로 생긴 안내 줄만 나타나기 시작한다. 제목과 내용은 그대로다
    expect(timing).toHaveBeenCalledTimes(3);
    expect(screen.getByText('제목')).toBeTruthy();
  });
});
