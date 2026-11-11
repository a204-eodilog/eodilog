import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Spinner } from './spinner';

describe('Spinner', () => {
  it('받은 칸의 한가운데에 놓인다', async () => {
    await render(<Spinner style={{ flex: 1 }} accessibilityLabel="불러오는 중" />);
    const box = screen.getByLabelText('불러오는 중');
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    });
  });

  it('로딩 표시라는 것을 화면 읽어 주기에 알린다', async () => {
    await render(<Spinner accessibilityLabel="불러오는 중" />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});
