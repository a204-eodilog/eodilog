import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';

import { Avatar } from './avatar';

/**
 * 얼굴 사진은 글자 얼굴 위에 올린다. 받는 동안과 받지 못했을 때 이름 첫 글자가 보인다.
 * 예전에는 주소가 있으면 사진만 그려, 받는 동안과 받기에 실패했을 때 빈 동그라미가 남았다
 */

// 사진 부품이 받은 속성을 꺼내 받기 실패를 흉내 낸다
const mockImage: { props: { onError?: () => void } | null } = { props: null };
jest.mock('expo-image', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: (props: { onError?: () => void; source: { uri: string } }) => {
      mockImage.props = props;
      return <Text>{`사진 ${props.source.uri}`}</Text>;
    },
  };
});
jest.mock('@/lib/asset-image', () => ({
  assetSource: (url?: string | null) => (url ? { uri: url } : null),
}));

describe('Avatar', () => {
  it('사진 주소가 없으면 이름 첫 글자만 보인다', async () => {
    await render(<Avatar name="세은" />);
    expect(screen.getByText('세')).toBeTruthy();
    expect(screen.queryByText(/^사진 /)).toBeNull();
  });

  it('사진 주소가 있으면 글자 얼굴 위에 사진을 올린다', async () => {
    await render(<Avatar name="세은" imageUrl="https://example.com/a.jpg" />);
    expect(screen.getByText('사진 https://example.com/a.jpg')).toBeTruthy();
    // 받는 동안 밑에 보인다
    expect(screen.getByText('세')).toBeTruthy();
  });

  it('사진을 받지 못하면 사진을 치우고 글자 얼굴만 남긴다', async () => {
    await render(<Avatar name="세은" imageUrl="https://example.com/a.jpg" />);
    await act(async () => {
      mockImage.props?.onError?.();
    });
    expect(screen.queryByText(/^사진 /)).toBeNull();
    expect(screen.getByText('세')).toBeTruthy();
  });

  it('주소가 바뀌면 사진을 다시 받아 본다', async () => {
    const view = await render(<Avatar name="세은" imageUrl="https://example.com/a.jpg" />);
    await act(async () => {
      mockImage.props?.onError?.();
    });
    await view.rerender(<Avatar name="세은" imageUrl="https://example.com/b.jpg" />);
    expect(screen.getByText('사진 https://example.com/b.jpg')).toBeTruthy();
  });
});
