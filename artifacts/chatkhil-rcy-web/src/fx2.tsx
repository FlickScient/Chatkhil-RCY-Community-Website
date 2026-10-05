import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

type Lang = 'bn' | 'en';
const fine = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Word-by-word headline reveal. `auto` plays on mount; otherwise plays when an ancestor gets .home-revealed. */
export function Words({ text, auto = false, from = 0 }: { text: string; auto?: boolean; from?: number }) {
  let i = from;
  return (
    <>
      {text.split(/(\s+)/).map((part, k) =>
        part === '' || /^\s+$/.test(part) ? (
          part
        ) : (
          <span key={k} className={`fx2-word${auto ? ' fx2-word-auto' : ''}`} style={{ animationDelay: `${i++ * 60}ms` }}>
            {part}
          </span>
        ),
      )}
    </>
  );
}

/** Falling blood drop + ripple that straddles the boundary between two sections. */
export function DropDivider() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || !('IntersectionObserver' in window)) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(entries => entries.forEach(e => setOn(e.isIntersecting)), { threshold: 0.4 });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} aria-hidden="true" className={`fx2-drop-wrap${on ? ' on' : ''}`}>
      <svg viewBox="0 0 80 160" className="fx2-drop-svg">
        <ellipse className="fx2-ripple" cx="40" cy="80" rx="4" ry="1.4" />
        <ellipse className="fx2-ripple r2" cx="40" cy="80" rx="4" ry="1.4" />
        <path className="fx2-drop" d="M40 0C40 0 28 18 28 26a12 12 0 0 0 24 0C52 18 40 0 40 0Z" />
      </svg>
    </div>
  );
}

/** Faint ECG heartbeat line with a travelling pulse, for behind the Impact section. */
export function Heartbeat() {
  const d = 'M0 60H260L290 60L312 18L338 102L364 6L392 60H540L566 60L584 42L604 60H820L846 60L868 22L892 98L916 10L942 60H1200';
  return (
    <svg aria-hidden="true" className="fx2-ecg" viewBox="0 0 1200 120" preserveAspectRatio="none">
      <path className="base" d={d} pathLength={1} />
      <path className="pulse" d={d} pathLength={1} />
    </svg>
  );
}

function Loader() {
  const [phase, setPhase] = useState<'show' | 'hide' | 'gone'>(() => {
    try {
      if (reduced() || sessionStorage.getItem('fx2-loaded')) return 'gone';
    } catch {}
    return 'show';
  });
  useEffect(() => {
    if (phase === 'gone') return;
    const t1 = setTimeout(() => setPhase('hide'), 1000);
    const t2 = setTimeout(() => {
      setPhase('gone');
      try {
        sessionStorage.setItem('fx2-loaded', '1');
      } catch {}
    }, 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (phase === 'gone') return null;
  return (
    <div className={`fx2-loader${phase === 'hide' ? ' hide' : ''}`} aria-hidden="true">
      <div className="fx2-loader-inner">
        <svg viewBox="0 0 72 32" className="fx2-loader-mark">
          <path d="M22 5a11 11 0 1 0 0 22 9 9 0 0 1 0-22Z" fill="currentColor" />
          <path d="M50 7h4v7h7v4h-7v7h-4v-7h-7v-4h7z" fill="currentColor" />
        </svg>
        <div className="fx2-loader-text">RED CRESCENT · YOUTH</div>
        <div className="fx2-loader-bar"><span /></div>
      </div>
    </div>
  );
}

/** Scroll progress, parallax var, custom cursor, card tilt, back-to-top and first-load curtain. Public pages only. */
export function Fx2Layer({ lang }: { lang: Lang }) {
  const [path] = useLocation();
  const admin = /^\/admin(?:\/|$)/i.test(path);
  const [showTop, setShowTop] = useState(false);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  // scroll progress + parallax variable + back-to-top visibility
  useEffect(() => {
    if (admin) return;
    const root = document.documentElement;
    const still = reduced();
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = root.scrollHeight - window.innerHeight;
      root.style.setProperty('--fx2-progress', String(max > 0 ? Math.min(1, y / max) : 0));
      if (!still) root.style.setProperty('--fx2-scroll', String(y));
      setShowTop(y > 520);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [admin, path]);

  // 3D card tilt with a moving shine (event delegation)
  useEffect(() => {
    if (admin || !fine() || reduced()) return;
    const sel = '.home-lift, [data-testid^="member-card"], [data-testid^="content-"]';
    let cur: HTMLElement | null = null;
    const reset = (el: HTMLElement) => {
      el.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
      window.setTimeout(() => {
        if (el !== cur) el.style.transition = '';
      }, 480);
    };
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(sel) as HTMLElement | null;
      if (cur && cur !== el) {
        reset(cur);
        cur = null;
      }
      if (!el) return;
      if (!cur) {
        cur = el;
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.classList.add('fx2-tilt');
      }
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.transition = 'transform .12s ease-out';
      el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * 7).toFixed(2)}deg) rotateY(${((x - 0.5) * 9).toFixed(2)}deg) translateY(-4px)`;
      el.style.setProperty('--fx2-mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--fx2-my', `${(y * 100).toFixed(1)}%`);
    };
    const out = () => {
      if (cur) {
        reset(cur);
        cur = null;
      }
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('mouseleave', out);
    return () => {
      document.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('mouseleave', out);
      out();
    };
  }, [admin]);

  // custom cursor: dot + trailing ring that grows over links
  useEffect(() => {
    if (admin || !fine() || reduced()) return;
    const d = dot.current;
    const r = ring.current;
    if (!d || !r) return;
    document.body.classList.add('fx2-cursor-on');
    let tx = -100, ty = -100, rx = -100, ry = -100, raf = 0;
    const loop = () => {
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      r.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      d.style.transform = `translate3d(${tx}px,${ty}px,0)`;
      d.classList.add('vis');
      r.classList.add('vis');
    };
    const over = (e: PointerEvent) => {
      const t = e.target as Element | null;
      const text = !!t?.closest?.('input,textarea,select,[contenteditable="true"]');
      const link = !!t?.closest?.('a,button,[role="button"],label,summary');
      r.classList.toggle('is-link', link && !text);
      d.classList.toggle('is-text', text);
      r.classList.toggle('is-text', text);
    };
    const down = () => r.classList.add('is-down');
    const up = () => r.classList.remove('is-down');
    const leave = () => {
      d.classList.remove('vis');
      r.classList.remove('vis');
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerover', over, { passive: true });
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove('fx2-cursor-on');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.documentElement.removeEventListener('mouseleave', leave);
    };
  }, [admin]);

  if (admin) return null;
  const label = lang === 'bn' ? 'উপরে ফিরে যান' : 'Back to top';
  return (
    <>
      <div className="fx2-progress" aria-hidden="true" />
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })}
        className={`fx2-top${showTop ? ' show' : ''}`}
        aria-label={label}
        aria-hidden={!showTop}
        tabIndex={showTop ? 0 : -1}
        data-testid="button-back-to-top"
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle className="track" cx="24" cy="24" r="21" />
          <circle className="bar" cx="24" cy="24" r="21" />
          <path d="M19 15a9.5 9.5 0 1 0 0 18 7.8 7.8 0 0 1 0-18Z" fill="currentColor" transform="translate(5 0)" />
        </svg>
      </button>
      <div ref={ring} className="fx2-cursor-ring" aria-hidden="true"><i /></div>
      <div ref={dot} className="fx2-cursor-dot" aria-hidden="true" />
      <Loader />
    </>
  );
}
