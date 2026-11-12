import { Check, CloudRain, Heart, Link2, MapPin, Sparkles, Star } from 'lucide-react'
import type { ReactNode } from 'react'

import type { FeatureId } from './content'

// src/shots/<id>.png 같은 실제 앱 캡처가 있으면 그 그림을 쓰고, 없으면 아래의 간단한 화면 그림을 쓴다
const shots = import.meta.glob<string>('./shots/*.{png,webp,jpg,jpeg}', {
  eager: true,
  import: 'default',
})

function shotFor(id: string): string | undefined {
  const hit = Object.entries(shots).find(([path]) => path.replace(/^.*\/|\.\w+$/g, '') === id)
  return hit?.[1]
}

const FACES = ['sky', 'mint', 'lavender', 'apricot'] as const

function Faces({ count = 3 }: { count?: number }) {
  return (
    <span className="faces" aria-hidden="true">
      {FACES.slice(0, count).map((tone) => (
        <i key={tone} className={`face face-${tone}`} />
      ))}
    </span>
  )
}

function Bar({ w, tone = 'line' }: { w: number; tone?: 'line' | 'strong' | 'brand' }) {
  return <span className={`bar bar-${tone}`} style={{ width: `${w}%` }} />
}

function Collect() {
  return (
    <>
      <p className="m-title">그룹 즐겨찾기</p>
      <div className="m-link">
        <Link2 size={14} />
        <span>youtu.be/busan-vlog</span>
        <b>장소 3곳</b>
      </div>
      {['해운대 블루라인파크', '광안리 해변', '감천문화마을'].map((name, i) => (
        <div className="m-row" key={name}>
          <span className="m-thumb" data-tone={i} />
          <span className="m-col">
            <strong>{name}</strong>
            <Bar w={62 - i * 10} />
          </span>
          {i === 0 ? <em className="m-chip">2명 겹침</em> : <Faces count={1 + (i % 2)} />}
        </div>
      ))}
    </>
  )
}

function Recommend() {
  const picks = [
    { name: '부산', why: '바다와 맛집 취향이 3명 겹쳐요' },
    { name: '강릉', why: '함께 담은 카페가 5곳 있어요' },
  ]
  return (
    <>
      <p className="m-title">추천 결과</p>
      <p className="m-sub">담은 장소 14곳 · 취향 4명 반영</p>
      {picks.map((pick, i) => (
        <div className="m-pick" key={pick.name}>
          <span className="m-thumb" data-tone={i} />
          <span className="m-col">
            <strong>{pick.name}</strong>
            <small>{pick.why}</small>
          </span>
        </div>
      ))}
      <div className="m-actions">
        <b>투표 후보로</b>
        <span>그룹에 담기</span>
      </div>
      <div className="m-editing">
        <Sparkles size={13} />
        <span>다시 추천받기</span>
      </div>
    </>
  )
}

function Decide() {
  const rows = [
    { name: '부산', pct: 75, mine: true },
    { name: '강릉', pct: 50, mine: false },
    { name: '전주', pct: 25, mine: false },
  ]
  return (
    <>
      <p className="m-title">어디로 갈까요?</p>
      <p className="m-sub">오늘 21:00 마감 · 4명 중 3명 참여</p>
      {rows.map((row) => (
        <div className={`m-vote${row.mine ? ' is-mine' : ''}`} key={row.name}>
          <span className="m-vote-fill" style={{ width: `${row.pct}%` }} />
          <strong>{row.name}</strong>
          {row.mine ? <Check size={14} /> : null}
          <span className="m-vote-pct">{row.pct}%</span>
        </div>
      ))}
      <div className="m-bubble">
        <Faces count={1} />
        <span>부산으로 확정됐어요</span>
      </div>
    </>
  )
}

function Course() {
  const stops = ['해운대 블루라인파크', '해리단길 점심', '광안리 해변']
  return (
    <>
      <p className="m-title">1일차 코스</p>
      <div className="m-map">
        <svg viewBox="0 0 200 70" aria-hidden="true">
          <path d="M18 52 C 60 8, 96 66, 134 30 S 176 18, 184 22" className="m-route" />
          <circle cx="18" cy="52" r="5" />
          <circle cx="104" cy="44" r="5" />
          <circle cx="184" cy="22" r="5" />
        </svg>
      </div>
      {stops.map((name, i) => (
        <div className="m-stop" key={name}>
          <span className="m-num">{i + 1}</span>
          <span className="m-col">
            <strong>{name}</strong>
            {i < stops.length - 1 ? <small>도보 {8 + i * 6}분</small> : <Bar w={40} />}
          </span>
        </div>
      ))}
      <div className="m-editing">
        <Faces count={2} />
        <span>함께 고치는 중</span>
      </div>
    </>
  )
}

function OnTrip() {
  return (
    <>
      <p className="m-title">부산 여행 2일차</p>
      <div className="m-weather">
        <CloudRain size={20} />
        <span className="m-col">
          <strong>오후 3시부터 비</strong>
          <small>실내로 바꿀 만한 곳이 있어요</small>
        </span>
      </div>
      <p className="m-label">준비물</p>
      {[
        { name: '우산', done: true },
        { name: '보조 배터리', done: true },
        { name: '상비약', done: false },
      ].map((item) => (
        <div className={`m-check${item.done ? ' is-done' : ''}`} key={item.name}>
          <span className="m-box">{item.done ? <Check size={11} /> : null}</span>
          <span>{item.name}</span>
          {item.done ? <Faces count={1} /> : null}
        </div>
      ))}
    </>
  )
}

function Record() {
  return (
    <>
      <p className="m-title">여행 사진</p>
      <div className="m-tabs">
        <b>전체</b>
        <span>음식</span>
        <span>풍경</span>
        <span>사람</span>
      </div>
      <div className="m-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} data-tone={i % 4} />
        ))}
      </div>
      <div className="m-settle">
        <span className="m-col">
          <small>정산 결과</small>
          <strong>민지 → 서준 18,500원</strong>
        </span>
        <span className="m-stars" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={10} fill="currentColor" />
          ))}
        </span>
      </div>
    </>
  )
}

function FriendMap() {
  return (
    <>
      <p className="m-title">친구 여행 지도</p>
      <div className="m-bigmap">
        <svg viewBox="0 0 200 150" aria-hidden="true">
          <path
            d="M70 12 C 104 6, 132 22, 138 48 C 150 60, 156 82, 144 104 C 138 126, 112 140, 90 136 C 66 138, 50 120, 54 98 C 42 80, 44 60, 56 46 C 54 30, 58 18, 70 12 Z"
            className="m-land"
          />
        </svg>
        <span className="m-pin" style={{ left: '62%', top: '26%' }}>
          <MapPin size={16} />
        </span>
        <span className="m-pin is-soft" style={{ left: '38%', top: '52%' }}>
          <MapPin size={16} />
        </span>
        <span className="m-pin" style={{ left: '58%', top: '70%' }}>
          <MapPin size={16} />
        </span>
      </div>
      <div className="m-feed">
        <Faces count={2} />
        <span className="m-col">
          <strong>남도 맛집 여행</strong>
          <small>2박 3일 · 장소 12곳</small>
        </span>
        <Heart size={14} />
      </div>
    </>
  )
}

const MOCKS: Record<FeatureId, () => ReactNode> = {
  collect: Collect,
  recommend: Recommend,
  decide: Decide,
  course: Course,
  ontrip: OnTrip,
  record: Record,
  map: FriendMap,
}

/** 폰 틀. 실제 캡처가 있으면 캡처를, 없으면 화면 그림을 넣는다 */
export function Phone({ id, label, className = '' }: { id: FeatureId; label: string; className?: string }) {
  const shot = shotFor(id)
  const Mock = MOCKS[id]
  return (
    <div className={`phone ${className}`} role="img" aria-label={`${label} 화면`}>
      <span className="phone-notch" aria-hidden="true" />
      <div className="phone-screen" aria-hidden="true">
        {shot ? (
          <img src={shot} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="mock">
            <Mock />
          </div>
        )}
      </div>
    </div>
  )
}
