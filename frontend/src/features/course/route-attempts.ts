/**
 * 이동 시간 계산을 이미 요청해 본 코스(여행 + 버전).
 * 서버는 '아직 안 구함'과 '구하지 못함'을 같은 값(UNAVAILABLE)으로 줘서 앱이 따로 기억한다.
 * 계산은 코스 버전을 올리지 않으므로, 같은 버전에 시간 없는 구간이 남아 있으면 구하지 못한 것이다.
 * 앱을 다시 켜면 비워지고, 그때는 한 번 더 요청한다
 */
const attempted = new Set<string>();

const keyOf = (tripId: string, version: number) => `${tripId}:${version}`;

export function markRouteAttempt(tripId: string, version: number): void {
  attempted.add(keyOf(tripId, version));
}

export function routeAttempted(tripId: string, version: number): boolean {
  return attempted.has(keyOf(tripId, version));
}

/** 테스트에서 앞 테스트의 기억을 지운다 */
export function clearRouteAttempts(): void {
  attempted.clear();
}
