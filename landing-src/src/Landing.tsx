import {
  ArrowDown,
  ArrowRight,
  Bell,
  Check,
  CloudSun,
  Compass,
  Download,
  History,
  Images,
  Link2,
  ListChecks,
  MapPin,
  MessageSquareText,
  PencilLine,
  Route,
  Undo2,
  Users,
  MessageCircle,
  Send,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  TrendingUp,
  Vote,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useRef } from 'react'

import {
  aiMoments,
  extras,
  features,
  pains,
  releases,
  SITE_URL,
  together,
  type AiIcon,
  type ExtraIcon,
  type TogetherIcon,
} from './content'

const TOGETHER_ICONS: Record<TogetherIcon, typeof Bell> = {
  edit: PencilLine,
  card: MessageSquareText,
  anyone: Users,
  undo: Undo2,
}

const AI_ICONS: Record<AiIcon, typeof Bell> = {
  place: Link2,
  recommend: Compass,
  course: Route,
  weather: CloudSun,
  checklist: ListChecks,
  photo: Images,
}

const EXTRA_ICONS: Record<ExtraIcon, typeof Bell> = {
  ontrip: CloudSun,
  map: MapPin,
  invite: Send,
  bell: Bell,
  taste: SlidersHorizontal,
  proposal: Sparkles,
  trend: TrendingUp,
  timeline: History,
}
import { Logo } from './Logo'
import { Phone } from './Screens'
import { useScrollMotion } from './useScrollMotion'

/** 줄바꿈(\n)마다 줄을 나눠, 줄이 아래에서 올라오는 효과를 줄 수 있게 감싼다 */
function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line) => (
        <span className="line" key={line}>
          <span className="line-inner">{line}</span>
        </span>
      ))}
    </>
  )
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null)
  useScrollMotion(root)

  const latest = releases[0]
  const qrTarget = latest?.url ?? SITE_URL

  return (
    <div ref={root}>
      <a className="skip" href="#main">
        본문으로 건너뛰기
      </a>
      <div className="progress" aria-hidden="true">
        <span className="progress-fill" />
      </div>

      <header className="nav">
        <a className="brand" href="#top" aria-label="어디로그 처음으로">
          <Logo size={32} />
          <span>어디로그</span>
        </a>
        <a className="btn btn-small" href="#download">
          앱 받기
        </a>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="aurora" aria-hidden="true">
            <i className="blob blob-a" />
            <i className="blob blob-b" />
            <i className="blob blob-c" />
          </div>
          <div className="hero-copy">
            <p className="eyebrow hero-in">동행과 함께 쓰는 여행 앱</p>
            <h1>
              <Lines text={'같이 정하고,\n같이 떠나고,\n같이 남기는 여행'} />
            </h1>
            <p className="lead hero-in">
              흩어진 링크와 끝나지 않는 단톡방 대신, 장소 모으기부터 투표, 코스, 사진과 정산까지
              어디로그 한곳에서 해요.
            </p>
            <div className="hero-actions hero-in">
              <a className="btn" href="#download">
                <Download size={18} aria-hidden="true" />앱 받기
              </a>
              <a className="btn btn-ghost" href="#features">
                기능 둘러보기
                <ArrowDown size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-drift">
              <Phone id="course" label="코스 짜기" className="hero-phone" />
            </div>
            <div className="float float-a" data-speed="-70" aria-hidden="true">
              <Vote size={18} />
              <span>
                <b>부산</b> 3표로 확정
              </span>
            </div>
            <div className="float float-b" data-speed="-130" aria-hidden="true">
              <MessageCircle size={18} />
              <span>여기 어때? 다들 좋아하겠다</span>
            </div>
            <div className="float float-c" data-speed="-40" aria-hidden="true">
              <MapPin size={18} />
              <span>
                장소 <b>12곳</b> 담김
              </span>
            </div>
          </div>
        </section>

        <section className="section" id="why">
          <p className="eyebrow" data-reveal>
            왜 필요한가요
          </p>
          <h2 data-reveal>여행 준비, 이런 적 있지 않나요?</h2>
          <ul className="pains">
            {pains.map((pain, i) => (
              <li className="pain" key={pain.title} data-pain>
                <span className="pain-num">{String(i + 1).padStart(2, '0')}</span>
                <strong>{pain.title}</strong>
                <p>{pain.body}</p>
              </li>
            ))}
          </ul>
          <p className="answer" data-reveal>
            어디로그는 여행의 <b>처음부터 끝까지</b>를 동행 모두가 같은 화면에서 보게 해요.
          </p>
        </section>

        <section className="section features" id="features">
          <p className="eyebrow" data-reveal>
            핵심 기능
          </p>
          <h2 data-reveal>여행 한 번의 흐름을 그대로 담았어요</h2>
          <p className="section-lead" data-reveal>
            모으고, 정하고, 짜고, 남기기. 여행의 네 단계가 하나로 이어져요.
          </p>
          <ol className="flow" aria-label="여행 흐름">
            <i className="flow-line" aria-hidden="true" />
            {features.map((feature, i) => (
              <li key={feature.id} data-flow>
                <span>{i + 1}</span>
                {feature.stage}
              </li>
            ))}
          </ol>

          <div className="feature-list">
            {features.map((feature, i) => (
              <article
                className={`feature tone-${i % 4}${i % 2 ? ' is-flip' : ''}`}
                id={feature.id}
                key={feature.id}
              >
                <span className="feature-num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="feature-visual">
                  <i className="feature-glow" aria-hidden="true" />
                  <Phone id={feature.id} label={feature.stage} className="feature-phone" />
                </div>
                <div className="feature-copy">
                  <p className="feature-stage" data-item>
                    {feature.stage}
                  </p>
                  <h3 data-item>
                    {feature.title.split('\n').map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </h3>
                  <p data-item>{feature.body}</p>
                  <ul>
                    {feature.points.map((point) => (
                      <li key={point} data-item>
                        <Check size={15} aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section together" id="together">
          <p className="eyebrow" data-reveal>
            함께라서 다른 점
          </p>
          <h2 data-reveal>한 사람이 다 하지 않아도 돼요</h2>
          <div className="together-grid">
            <div className="board" aria-hidden="true">
              <div className="board-head">
                <strong>1일차 코스</strong>
                <span className="live">
                  <i />
                  3명이 보는 중
                </span>
                <span className="faces">
                  <i className="face face-sky" />
                  <i className="face face-lavender" />
                  <i className="face face-mint" />
                </span>
              </div>
              {['해운대 블루라인파크', '해리단길 점심', '광안리 해변'].map((name, i) => (
                <div className={`board-row${i === 1 ? ' is-editing' : ''}`} key={name} data-board-row>
                  <span className="m-num">{i + 1}</span>
                  <strong>{name}</strong>
                  <span className="board-grip" />
                </div>
              ))}
              <span className="cursor cursor-a">민지</span>
              <span className="cursor cursor-b">서준</span>
              <div className="syscard">
                <span className="syscard-icon">
                  <Vote size={16} />
                </span>
                <span>
                  <b>투표가 끝났어요</b>
                  <small>부산으로 확정 · 보러 가기</small>
                </span>
              </div>
              <div className="undo">
                변경안을 적용했어요
                <b>
                  <Undo2 size={14} />
                  되돌리기
                </b>
              </div>
            </div>
            <ul className="together-list">
              {together.map((item) => {
                const Icon = TOGETHER_ICONS[item.icon]
                return (
                  <li key={item.title} data-together>
                    <span className="together-icon" aria-hidden="true">
                      <Icon size={20} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section className="ai" id="ai">
          <i className="ai-orb ai-orb-a" aria-hidden="true" />
          <i className="ai-orb ai-orb-b" aria-hidden="true" />
          <div className="ai-inner">
            <p className="eyebrow eyebrow-ai" data-reveal>
              <Sparkles size={15} aria-hidden="true" />
              AI가 돕는 순간
            </p>
            <h2 data-reveal>번거로운 일은 AI가 먼저 해 둬요</h2>
            <p className="section-lead" data-reveal>
              여행 내내 여섯 번, 손이 많이 가는 일을 대신 정리해요. 결과는 제안일 뿐이라 고르고 고치는 건
              언제나 우리예요.
            </p>
            <ul className="ai-grid">
              {aiMoments.map((moment) => {
                const Icon = AI_ICONS[moment.icon]
                return (
                  <li className="ai-card" key={moment.title} data-ai>
                    <div className="ai-head">
                      <span className="ai-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <strong>{moment.title}</strong>
                    </div>
                    <p className="ai-flow">
                      <span className="ai-from">{moment.from}</span>
                      <span className="ai-arrow" aria-hidden="true">
                        <i />
                        <ArrowRight size={14} />
                      </span>
                      <span className="visually-hidden">에서</span>
                      <span className="ai-to">{moment.to}</span>
                    </p>
                    <p>{moment.body}</p>
                  </li>
                )
              })}
            </ul>
            <p className="ai-note" data-reveal>
              AI 기능은 설정에서 종류별로 켜고 끌 수 있어요.
            </p>
          </div>
        </section>

        <section className="section" id="more">
          <p className="eyebrow" data-reveal>
            이런 것도 돼요
          </p>
          <h2 data-reveal>여행 사이사이를 채우는 기능</h2>
          <ul className="extras">
            {extras.map((extra) => {
              const Icon = EXTRA_ICONS[extra.icon]
              return (
                <li className="extra" key={extra.title} data-extra>
                  <span className="extra-icon" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <strong>{extra.title}</strong>
                  <p>{extra.body}</p>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="download" id="download">
          <div className="download-card" data-pop>
            <div className="download-copy">
              <p className="eyebrow on-brand">앱 받기</p>
              <h2>다음 여행은 어디로그로 시작해요</h2>
              <p>안드로이드 설치 파일을 준비하고 있어요. 공개되면 아래 목록과 QR에서 바로 받을 수 있어요.</p>
              <ul className="releases" aria-label="배포한 버전">
                {releases.map((release) => (
                  <li key={release.version}>
                    <Smartphone size={18} aria-hidden="true" />
                    <span className="release-text">
                      <strong>{release.version}</strong>
                      <small>
                        {release.date} · {release.note}
                      </small>
                    </span>
                    {release.url ? (
                      <a className="btn btn-white btn-small" href={release.url}>
                        <Download size={16} aria-hidden="true" />
                        받기
                      </a>
                    ) : (
                      <span className="badge">준비 중</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="qr">
              <QRCodeSVG value={qrTarget} size={148} marginSize={0} fgColor="#1F2430" title="어디로그 QR 코드" />
              <p>{latest?.url ? '폰 카메라로 찍어 설치해요' : '임시 QR이에요. 지금은 이 페이지로 연결돼요'}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
