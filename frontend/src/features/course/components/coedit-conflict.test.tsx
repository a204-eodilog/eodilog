import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CoeditConflict } from './coedit-conflict';

jest.mock('@/components/ui', () => ({ Button: () => null }));

describe('함께 편집 충돌 상자', () => {
  it('안드로이드 뒤로 가기로는 닫히지 않아 내 변경을 묻지 않고 버리지 않는다', async () => {
    const onLatest = jest.fn();
    const onOverwrite = jest.fn();
    await render(
      <CoeditConflict editor="세은님" busy={false} onOverwrite={onOverwrite} onLatest={onLatest} />,
    );
    fireEvent(screen.getByTestId('coedit-conflict'), 'requestClose');
    expect(onLatest).not.toHaveBeenCalled();
    expect(onOverwrite).not.toHaveBeenCalled();
    expect(screen.getByText('세은님이 먼저 코스를 바꿨어요')).toBeTruthy();
  });
});
