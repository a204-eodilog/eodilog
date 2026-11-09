import { useCallback, useState } from 'react';

import { PlaceSaveSheet, type SavePlace } from '@/features/saved';

/**
 * 장소 하나를 S08 장소 저장 시트로 저장한다(S07 장소 줄, N3 대표 장소, N7 [저장]).
 * 닫는 동안 시트 글자가 비지 않게 마지막 장소를 남겨 둔다.
 *
 * @example
 * const placeSave = usePlaceSave();
 * <Button onPress={() => placeSave.open({ id, name })} />
 * {placeSave.sheet}
 */
export function usePlaceSave() {
  const [place, setPlace] = useState<SavePlace | null>(null);
  const [visible, setVisible] = useState(false);
  const open = useCallback((next: SavePlace) => {
    setPlace(next);
    setVisible(true);
  }, []);
  const sheet = (
    <PlaceSaveSheet
      visible={visible}
      places={place ? [place] : []}
      onClose={() => setVisible(false)}
    />
  );
  return { open, sheet };
}
