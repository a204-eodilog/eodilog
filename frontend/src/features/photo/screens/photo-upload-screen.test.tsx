import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, cleanup, render } from '@testing-library/react-native';
import { StrictMode } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { PhotoUploadScreen } from './photo-upload-screen';

jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: '여행' }) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ tripId: 'trip-1' }),
  usePreventRemove: jest.fn(),
}));
jest.mock('@/components/ui', () => ({
  ConfirmSheet: () => null,
  toast: { show: jest.fn(), error: jest.fn(), success: jest.fn() },
}));
jest.mock('../api', () => ({ getTripTitle: jest.fn() }));
jest.mock('../components/photo-upload-view', () => ({ PhotoUploadView: () => null }));
jest.mock('../hooks/use-photo-upload', () => ({
  usePhotoUpload: () => ({ phase: 'idle', items: [], cancel: jest.fn() }),
}));
afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});
function pendingPicker() {
  let resolve!: (value: ImagePicker.ImagePickerResult) => void;
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  return () => resolve({ canceled: true, assets: null });
}
describe('사진첩 자동 열기', () => {
  it('화면을 떠난 뒤 도착한 취소는 다른 화면을 뒤로 보내지 않는다', async () => {
    const cancel = pendingPicker();
    const view = await render(<PhotoUploadScreen />);
    await view.unmount();
    await act(async () => cancel());
    expect(router.back).not.toHaveBeenCalled();
  });
  it('StrictMode와 재렌더에도 한 번 열고 처음 취소하면 한 번 돌아간다', async () => {
    const cancel = pendingPicker();
    const view = await render(
      <StrictMode>
        <PhotoUploadScreen />
      </StrictMode>,
    );
    await view.rerender(
      <StrictMode>
        <PhotoUploadScreen />
      </StrictMode>,
    );
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    await act(async () => cancel());
    expect(router.back).toHaveBeenCalledTimes(1);
  });
  it('새로 들어온 화면은 사진첩을 다시 연다', async () => {
    pendingPicker();
    const view = await render(<PhotoUploadScreen />);
    await view.unmount();
    await render(<PhotoUploadScreen />);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(2);
  });
});
