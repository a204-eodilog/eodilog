/** S46 대화방 얼굴 묶음·읽기 문구 규칙(채팅 탭 목록 전용). 화면 부품 없이 시험한다 */

/** 얼굴 묶음 상자. 인원수와 관계없이 같은 크기라 목록에서 방 이름 시작이 가지런하다 */
export const ROOM_FACES_SIZE = 44;

export type Face = { left: number; top: number; size: number };

/**
 * 인원수에 따른 얼굴 자리(44 상자 안, 테두리 포함 지름).
 * 1명: 가운데 하나 / 2명: 왼쪽 위·오른쪽 아래로 살짝 겹침 / 3명 이상: 위 하나·아래 둘 삼각형
 */
export function roomFaceLayout(count: number): Face[] {
  if (count <= 0) return [];
  if (count === 1) return [{ left: 2, top: 2, size: 40 }];
  if (count === 2) {
    return [
      { left: 0, top: 0, size: 30 },
      { left: 14, top: 14, size: 30 },
    ];
  }
  return [
    { left: 10, top: 0, size: 24 },
    { left: 0, top: 20, size: 24 },
    { left: 20, top: 20, size: 24 },
  ];
}

/** 카드 읽기 문구. "강릉 커피 투어, 참여자 6명, …" */
export function roomA11yLabel(parts: {
  title: string;
  count: number;
  kicker?: string;
  preview: string;
  time: string | null;
}): string {
  return [
    parts.title,
    `참여자 ${parts.count}명`,
    parts.kicker,
    parts.preview,
    parts.time ?? undefined,
  ]
    .filter(Boolean)
    .join(', ');
}
