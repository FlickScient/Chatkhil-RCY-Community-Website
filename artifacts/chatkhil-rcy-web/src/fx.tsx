import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

type Lang = 'bn' | 'en';
const copy = (lang: Lang, bn: string, en: string) => (lang === 'bn' ? bn : en);
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = () =>
  typeof window !== 'undefined' && !reduced() && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* 1 ─ Magnetic, spring-physics wrapper. Wrap any <Link>/<button>. */
export function Magnetic({
  children, strength = 0.28, tilt = 9, className = '',
}: { children: ReactNode; strength?: number; tilt?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !canHover()) return;
    // [x, y, rotateX, rotateY, scale]
    const cur = [0, 0, 0, 0, 1], vel = [0, 0, 0, 0, 0], tgt = [0, 0, 0, 0, 1];
    let raf = 0;
    const tick = () => {
      let moving = false;
      for (let i = 0; i < 5; i++) {
        vel[i] = (vel[i] + (tgt[i] - cur[i]) * 0.14) * 0.74; // spring + damping = overshoot on release
        cur[i] += vel[i];
        if (Math.abs(vel[i]) > 0.001 || Math.abs(tgt[i] - cur[i]) > 0.001) moving = true;
      }
      el.style.transform = `perspective(500px) translate3d(${cur[0]}px,${cur[1]}px,0) rotateX(${cur[2]}deg) rotateY(${cur[3]}deg) scale(${cur[4]})`;
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = Math.max(-1.2, Math.min(1.2, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      const dy = Math.max(-1.2, Math.min(1.2, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      tgt[0] = dx * r.width * strength * 0.5; tgt[1] = dy * r.height * strength * 0.7;
      tgt[2] = -dy * tilt; tgt[3] = dx * tilt; tgt[4] = 1.06;
      kick();
    };
    const leave = () => { tgt[0] = tgt[1] = tgt[2] = tgt[3] = 0; tgt[4] = 1; kick(); };
    const down = () => { tgt[4] = 0.95; kick(); };
    const up = () => { tgt[4] = 1.06; kick(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up);
    };
  }, [strength, tilt]);
  return <span ref={ref} className={`inline-block will-change-transform ${className}`}>{children}</span>;
}

/* 2 ─ Page transition: remounts on route change → fade + slide + un-blur, scrolls to top. */
export function PageTransition({ k, children }: { k: string; children: ReactNode }) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, [k]);
  return <div key={k} className="page-enter">{children}</div>;
}

/* 5 ─ Crescent + cross that draws itself. First visit only. */
export function CrescentIntro() {
  const [show, setShow] = useState(() => {
    try { return !reduced() && !localStorage.getItem('rcy-intro'); } catch { return false; }
  });
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (!show) return;
    try { localStorage.setItem('rcy-intro', '1'); } catch { /* private mode */ }
    const a = setTimeout(() => setOut(true), 1750);
    const b = setTimeout(() => setShow(false), 2350);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [show]);
  if (!show) return null;
  const crescent = 'M72 22A38 38 0 1 0 72 98A50 50 0 0 1 72 22Z';
  const cross = 'M96 44V76M80 60H112';
  return (
    <div className={`rcy-intro ${out ? 'out' : ''}`} onClick={() => setOut(true)} role="presentation" aria-hidden="true">
      <svg viewBox="24 6 100 108" className="h-40 w-40 sm:h-56 sm:w-56">
        <path d={crescent} className="rcy-fill" fill="#f5e9db" />
        <path d={crescent} pathLength={1} className="rcy-stroke" />
        <path d={cross} pathLength={1} className="rcy-stroke cross" />
      </svg>
    </div>
  );
}

/* 6 ─ Confetti burst (canvas, ~3s, maroon / red / cream). */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduced()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (canvas.width = innerWidth * dpr), H = (canvas.height = innerHeight * dpr);
    const colors = ['#c8102e', '#8b1028', '#7e1025', '#f5e9db', '#f4b28e', '#ffffff'];
    const parts = Array.from({ length: 170 }, () => {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.5, sp = (9 + Math.random() * 13) * dpr;
      return {
        x: W / 2, y: H * 0.42, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        w: (6 + Math.random() * 7) * dpr, h: (3 + Math.random() * 5) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: colors[(Math.random() * colors.length) | 0], round: Math.random() < 0.25,
      };
    });
    const start = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const age = t - start;
      for (const p of parts) {
        p.vy += 0.34 * dpr; p.vx *= 0.992; p.vy *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, Math.min(1, 1 - (age - 1800) / 1400));
        ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.h, 0, 7); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (age < 3200) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[5] h-full w-full" />;
}

/* 7 ─ Cursor-follow glow. Drop inside any `relative` dark section (desktop only). */
export function HeroGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current, host = el?.parentElement;
    if (!el || !host || !canHover()) return;
    let tx = 0.7, ty = 0.4, x = 0.7, y = 0.4, raf = 0;
    const tick = () => {
      x += (tx - x) * 0.08; y += (ty - y) * 0.08; // lerp = soft trailing
      el.style.setProperty('--gx', `${x * 100}%`); el.style.setProperty('--gy', `${y * 100}%`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width; ty = (e.clientY - r.top) / r.height;
      el.style.opacity = '1'; if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => { el.style.opacity = '0'; };
    host.addEventListener('pointermove', move); host.addEventListener('pointerleave', leave);
    return () => { cancelAnimationFrame(raf); host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); };
  }, []);
  return <div ref={ref} aria-hidden="true" className="hero-glow" />;
}

/* 8 ─ Big "Join" banner for the homepage: rising drops, pulsing rings, values marquee, magnetic CTAs. */
const drops = Array.from({ length: 16 }, (_, i) => ({
  x: (i * 61) % 100, d: 7 + ((i * 37) % 7), s: 8 + ((i * 13) % 14), delay: -((i * 29) % 11),
}));
const values = [
  ['মানবতা', 'Humanity'], ['নিরপেক্ষতা', 'Impartiality'], ['নিরপেক্ষতা', 'Neutrality'], ['স্বাধীনতা', 'Independence'],
  ['স্বেচ্ছাসেবা', 'Voluntary service'], ['ঐক্য', 'Unity'], ['সার্বজনীনতা', 'Universality'],
];
export function JoinBanner({ lang, title, summary }: { lang: Lang; title?: string; summary?: string }) {
  const row = values.map(v => v[lang === 'bn' ? 0 : 1]);
  return (
    <section className="home-reveal-on-scroll jb relative isolate overflow-hidden bg-[#5c1225] text-[#fff3e7]" data-testid="join-hero-banner">
      <img src="/assets/hero-relief.jpg" alt="" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-40" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(115deg,rgba(40,8,18,.96)_10%,rgba(126,16,37,.82)_60%,rgba(200,16,46,.55)_100%)]" />
      <HeroGlow />
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
        {[0, 1, 2, 3].map(i => <span key={i} className="jb-ring" style={{ animationDelay: `${i * 1.4}s` }} />)}
        {drops.map((d, i) => (
          <span key={i} className="jb-drop" style={{ left: `${d.x}%`, animationDuration: `${d.d}s`, animationDelay: `${d.delay}s`, ['--s' as any]: `${d.s}px` }}><i /></span>
        ))}
      </div>
      <div className="page-wrap relative grid min-h-[560px] items-center gap-10 py-20 sm:py-28 lg:min-h-[640px] lg:grid-cols-[1.35fr_1fr]">
        <div>
          <div className="home-mark text-[#f0b899]">{copy(lang, 'সদস্য হওয়ার আমন্ত্রণ', 'MEMBERSHIP IS OPEN')}</div>
          <h2 className="display shimmer-text mt-5 text-[clamp(2.8rem,7vw,6.2rem)] font-extrabold leading-[1.02]">
            {title || copy(lang, 'মানবতার পাশে দাঁড়ানোর সময় এখনই।', 'Your place in this work starts here.')}
          </h2>
          <p className="mt-6 max-w-xl whitespace-pre-line text-base leading-8 text-[#f4e5d9]/80 sm:text-lg">
            {summary || copy(lang, 'তিনটি ধাপের ছোট একটি ফর্ম। যাচাই শেষে ইউনিট থেকে যোগাযোগ করা হবে।', 'A short three-step form. Our unit will contact you once it has been reviewed.')}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Magnetic strength={0.4}>
              <Link href="/join" data-testid="join-hero-cta" className="btn-sheen inline-flex min-h-14 items-center gap-3 rounded-full bg-[#f5e9db] px-8 py-4 text-base font-extrabold text-[#741128] no-underline shadow-[0_18px_50px_-12px_rgba(0,0,0,.6)]">
                {copy(lang, 'সদস্যতার আবেদন করুন', 'Apply to join')} <ArrowUpRight size={18} />
              </Link>
            </Magnetic>
            <Magnetic strength={0.3}>
              <Link href="/application-status" data-testid="join-hero-status" className="inline-flex min-h-14 items-center gap-2 rounded-full border border-white/40 px-6 py-4 text-sm font-bold text-white no-underline hover:bg-white/10">
                {copy(lang, 'আবেদনের অবস্থা', 'Check status')} <ArrowRight size={15} />
              </Link>
            </Magnetic>
          </div>
        </div>
        <div aria-hidden="true" className="relative mx-auto hidden aspect-square w-full max-w-[380px] lg:block">
          <svg viewBox="24 6 100 108" className="jb-emblem h-full w-full">
            <path d="M72 22A38 38 0 1 0 72 98A50 50 0 0 1 72 22Z" fill="#f5e9db" />
            <path d="M96 44V76M80 60H112" stroke="#ff5a73" strokeWidth="6" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      </div>
      <div className="jb-marquee border-t border-white/15 bg-black/20 py-4 text-sm font-bold tracking-wide text-[#f3d9c8]" aria-hidden="true">
        <div className="jb-marquee-track">
          {[0, 1].map(n => <div key={n} className="flex shrink-0 items-center gap-10 pr-10">{row.concat(row).map((w, i) => <span key={i} className="flex items-center gap-10">{w}<span className="text-[#ff5a73]">✚</span></span>)}</div>)}
        </div>
      </div>
    </section>
  );
      }
