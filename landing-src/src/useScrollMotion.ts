import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useLayoutEffect, type RefObject } from 'react'

gsap.registerPlugin(ScrollTrigger)

/**
 * 페이지의 움직임을 한곳에서 건다.
 * 움직임 줄이기를 켠 사람에게는 아무것도 걸지 않아, 모든 내용이 처음부터 다 보인다.
 * 좁은 화면에서는 스크롤에 붙어 움직이는 효과(시차)를 빼고 나타나는 효과만 둔다
 */
export function useScrollMotion(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const scope = root.current
    if (!scope) return

    const mm = gsap.matchMedia(scope)

    mm.add(
      { motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 900px)' },
      (ctx) => {
        const { motion, wide } = ctx.conditions as { motion: boolean; wide: boolean }
        if (!motion) return

        // 맨 위 읽은 만큼 차는 줄
        gsap.to('.progress-fill', {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
        })

        // 내려가면 위쪽 메뉴에 바탕과 그림자가 생긴다
        ScrollTrigger.create({
          start: 24,
          end: 'max',
          toggleClass: { targets: '.nav', className: 'is-stuck' },
        })

        // 첫 화면: 글이 줄마다 올라오고, 폰과 떠 있는 카드가 차례로 나타난다
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('.hero .line-inner', { yPercent: 110, duration: 0.9, stagger: 0.09 })
          .from('.hero-in', { y: 20, autoAlpha: 0, duration: 0.6, stagger: 0.08 }, '-=0.55')
          .from('.hero-phone', { y: 70, autoAlpha: 0, rotate: 5, duration: 1 }, '-=0.9')
          .from('.float', { scale: 0.6, autoAlpha: 0, duration: 0.5, stagger: 0.12, ease: 'back.out(1.8)' }, '-=0.45')

        // 떠 있는 카드는 가만히 있을 때도 살짝 오르내린다
        gsap.utils.toArray<HTMLElement>('.float span').forEach((el, i) => {
          gsap.to(el.parentElement, {
            yPercent: i % 2 ? 10 : -10,
            duration: 2.4 + i * 0.5,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          })
        })

        if (wide) {
          // 내려갈수록 카드와 폰, 배경 빛이 서로 다른 빠르기로 움직인다
          gsap.utils.toArray<HTMLElement>('.float').forEach((el) => {
            gsap.to(el, {
              y: Number(el.dataset.speed),
              ease: 'none',
              scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 },
            })
          })
          // 폰이 처음 올라오는 움직임(.hero-phone)과 겹치지 않게, 스크롤 움직임은 폰을 감싼 틀에 건다
          gsap.to('.hero-drift', {
            y: -50,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 },
          })
          gsap.to('.blob', {
            yPercent: (i) => 18 + i * 12,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.8 },
          })
        }

        // 제목과 문단은 화면에 들어올 때 아래에서 올라온다.
        // 처음부터 숨겨 둔다. 들어온 순간에 숨기면, 화면 아래쪽에 이미 보이던 글이 사라졌다 다시 나타나 깜빡인다
        gsap.set('[data-reveal]', { y: 28, autoAlpha: 0 })
        ScrollTrigger.batch('[data-reveal]', {
          start: 'top 86%',
          once: true,
          onEnter: (els) =>
            gsap.to(els, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.1, ease: 'power3.out' }),
        })

        // 불편 카드는 살짝 기울어져 있다가 차례로 바로 선다
        gsap.from('[data-pain]', {
          y: 44,
          autoAlpha: 0,
          rotate: (i) => (i % 2 ? 3 : -3),
          duration: 0.6,
          stagger: 0.1,
          ease: 'back.out(1.4)',
          clearProps: 'transform',
          scrollTrigger: { trigger: '.pains', start: 'top 82%', once: true },
        })

        // 여행 흐름 줄: 선이 왼쪽에서 그어지고 단계가 차례로 튀어나온다
        gsap
          .timeline({ scrollTrigger: { trigger: '.flow', start: 'top 86%', once: true } })
          .from('.flow-line', { scaleX: 0, duration: 0.9, ease: 'power2.inOut' })
          .from(
            '[data-flow]',
            { y: 18, autoAlpha: 0, scale: 0.7, duration: 0.4, stagger: 0.08, ease: 'back.out(1.8)' },
            0.1,
          )

        // 기능 카드는 살짝 작았다가 커지며 올라오고, 폰은 옆에서 돌아 들어오고, 글은 한 줄씩 따라 나온다
        gsap.utils.toArray<HTMLElement>('.feature').forEach((feature) => {
          const flip = feature.classList.contains('is-flip')
          const side = wide ? (flip ? 1 : -1) : 0
          const trigger = { trigger: feature, start: 'top 80%', once: true }

          gsap.from(feature, {
            y: 64,
            scale: 0.94,
            autoAlpha: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: trigger,
          })
          gsap.from(feature.querySelector('.feature-phone'), {
            x: side * 60,
            y: 60,
            rotate: side * 8,
            autoAlpha: 0,
            duration: 0.9,
            delay: 0.15,
            ease: 'power3.out',
            scrollTrigger: trigger,
          })
          gsap.from(feature.querySelector('.feature-glow'), {
            scale: 0.4,
            autoAlpha: 0,
            duration: 1.1,
            delay: 0.15,
            ease: 'power2.out',
            scrollTrigger: trigger,
          })
          gsap.from(feature.querySelectorAll('[data-item]'), {
            y: 22,
            autoAlpha: 0,
            duration: 0.5,
            stagger: 0.06,
            delay: 0.25,
            ease: 'power3.out',
            scrollTrigger: trigger,
          })
          gsap.from(feature.querySelectorAll('.mock > *'), {
            y: 14,
            autoAlpha: 0,
            duration: 0.4,
            stagger: 0.06,
            delay: 0.55,
            ease: 'power2.out',
            scrollTrigger: trigger,
          })

          if (wide) {
            // 카드가 지나가는 동안 큰 숫자와 폰이 서로 반대로 조금씩 움직인다
            const scrub = { trigger: feature, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
            gsap.fromTo(
              feature.querySelector('.feature-num'),
              { yPercent: 28 },
              { yPercent: -28, ease: 'none', scrollTrigger: scrub },
            )
            gsap.fromTo(
              feature.querySelector('.feature-visual'),
              { y: 22 },
              { y: -22, ease: 'none', scrollTrigger: scrub },
            )
          }
        })

        // 함께 쓰는 그림: 판이 올라오고, 줄이 차례로 놓이고, 이름표와 카드, 되돌리기가 이어서 나타난다
        gsap
          .timeline({ scrollTrigger: { trigger: '.together-grid', start: 'top 78%', once: true } })
          .from('.board', { y: 50, scale: 0.94, autoAlpha: 0, duration: 0.7, ease: 'power3.out' })
          .from('[data-board-row]', { x: -24, autoAlpha: 0, duration: 0.4, stagger: 0.09, ease: 'power3.out' }, '-=0.3')
          .from('.cursor', { scale: 0, autoAlpha: 0, duration: 0.4, stagger: 0.15, ease: 'back.out(2.2)' }, '-=0.1')
          .from('.syscard', { x: 40, autoAlpha: 0, duration: 0.5, ease: 'power3.out' }, '-=0.15')
          .from('.undo', { y: 20, autoAlpha: 0, duration: 0.45, ease: 'back.out(1.8)' }, '-=0.2')
        gsap.from('[data-together]', {
          x: wide ? 40 : 0,
          y: wide ? 0 : 28,
          autoAlpha: 0,
          duration: 0.55,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.together-list', start: 'top 82%', once: true },
        })
        // 이름표는 누가 고치고 있는 것처럼 계속 조금씩 움직인다
        gsap.to('.cursor-a', { x: 14, y: -8, duration: 2.2, ease: 'sine.inOut', repeat: -1, yoyo: true })
        gsap.to('.cursor-b', { x: -12, y: 10, duration: 2.8, ease: 'sine.inOut', repeat: -1, yoyo: true })

        // AI 카드: 카드가 차례로 올라온 뒤, 화살표 선이 그어지고 결과 칩이 톡 튀어나온다
        gsap.utils.toArray<HTMLElement>('[data-ai]').forEach((card, i) => {
          gsap
            .timeline({
              delay: (i % 3) * 0.1,
              scrollTrigger: { trigger: card, start: 'top 88%', once: true },
            })
            .from(card, { y: 40, autoAlpha: 0, duration: 0.55, ease: 'power3.out', clearProps: 'transform' })
            .from(card.querySelector('.ai-icon'), { scale: 0, rotate: -40, duration: 0.45, ease: 'back.out(2)' }, '-=0.3')
            .from(card.querySelector('.ai-arrow i'), { scaleX: 0, duration: 0.4, ease: 'power2.inOut' }, '-=0.15')
            .from(card.querySelector('.ai-to'), { scale: 0.5, autoAlpha: 0, duration: 0.4, ease: 'back.out(2.2)' }, '-=0.1')
        })
        if (wide) {
          gsap.fromTo(
            '.ai-orb',
            { yPercent: -18 },
            { yPercent: 18, ease: 'none', scrollTrigger: { trigger: '.ai', start: 'top bottom', end: 'bottom top', scrub: 0.8 } },
          )
        }

        // 작은 기능 카드는 물결처럼 차례로 나타난다
        gsap.from('[data-extra]', {
          y: 36,
          autoAlpha: 0,
          scale: 0.94,
          duration: 0.5,
          stagger: { each: 0.07, grid: 'auto', from: 'start' },
          ease: 'back.out(1.4)',
          // 끝나면 변형 값을 지워야 카드에 마우스를 올렸을 때 떠오르는 효과가 먹는다
          clearProps: 'transform',
          scrollTrigger: { trigger: '.extras', start: 'top 84%', once: true },
        })

        // 마지막 내려받기 카드는 커지며 나타난다
        gsap.from('[data-pop]', {
          scale: 0.92,
          y: 40,
          autoAlpha: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.download', start: 'top 80%', once: true },
        })
        gsap.from('.qr', {
          scale: 0.7,
          autoAlpha: 0,
          rotate: -6,
          duration: 0.6,
          delay: 0.3,
          ease: 'back.out(1.6)',
          scrollTrigger: { trigger: '.download', start: 'top 80%', once: true },
        })
      },
    )

    // 글꼴이 늦게 들어오거나 내용 높이가 바뀌면 각 효과가 시작되는 위치가 어긋난다.
    // 높이가 바뀔 때마다 위치를 다시 잰다. 안 그러면 아래쪽 구간이 늦게 나타나거나 안 나타난다
    let timer = 0
    let lastHeight = document.body.scrollHeight
    const observer = new ResizeObserver(() => {
      const height = document.body.scrollHeight
      if (height === lastHeight) return
      lastHeight = height
      window.clearTimeout(timer)
      timer = window.setTimeout(() => ScrollTrigger.refresh(), 150)
    })
    observer.observe(document.body)
    void document.fonts.ready.then(() => ScrollTrigger.refresh())

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      mm.revert()
    }
  }, [root])
}
