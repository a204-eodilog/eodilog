/**
 * 어디로그 로고. 파란 둥근 네모 안에 위치 핀이 있고, 핀까지 이어지는 점선이 지나온 길(기록)을 뜻한다.
 * 탭 아이콘(static/favicon.svg)과 같은 그림이다
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4D8DF0" />
          <stop offset="1" stopColor="#1F5BC2" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-bg)" />
      <path
        d="M6.5 24.5c3-.2 4.6-1.6 5.6-3.4"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="0.1 3.6"
        opacity="0.85"
      />
      <path
        d="M18 6.2c-3.8 0-6.6 2.9-6.6 6.5 0 4.4 4.9 9.1 6 10.1a.9.9 0 0 0 1.2 0c1.1-1 6-5.7 6-10.1 0-3.6-2.8-6.5-6.6-6.5Z"
        fill="#fff"
      />
      <circle cx="18" cy="12.7" r="2.5" fill="#2A72E5" />
    </svg>
  )
}
