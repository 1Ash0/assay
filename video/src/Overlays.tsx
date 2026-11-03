// Type and chrome over the footage. Captions carry the whole story with the
// sound off; every number in them is a published claim or read off the run.
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion'
import { C, F } from './theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const out = Easing.out(Easing.cubic)

// Words marked *like this* take the accent colour.
export const Caption: React.FC<{ kicker?: string; text: string; inAt: number; outAt: number; accent?: string; size?: number; center?: boolean }> = ({ kicker, text, inAt, outAt, accent = C.cob, size = 66, center }) => {
  const f = useCurrentFrame()
  if (f < inAt - 1 || f > outAt + 8) return null
  const leave = interpolate(f, [outAt, outAt + 9], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) })
  const words = text.split(' ')
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: center ? 'center' : 'flex-start', padding: center ? '0 0 110px' : '0 120px 96px', pointerEvents: 'none' }}>
      <div style={{ opacity: 1 - leave, transform: `translateY(${-leave * 10}px)`, filter: leave > 0 ? `blur(${leave * 6}px)` : undefined, maxWidth: center ? 1500 : 1380, textAlign: center ? 'center' : 'left' }}>
        {kicker && (
          <div style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: 6, color: accent, marginBottom: 18, textTransform: 'uppercase',
            opacity: interpolate(f, [inAt, inAt + 6], [0, 1], clamp), transform: `translateX(${interpolate(f, [inAt, inAt + 10], [-24, 0], { ...clamp, easing: out })}px)` }}>
            {kicker}
          </div>
        )}
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: size, lineHeight: 1.08, letterSpacing: -1, color: C.ink, textWrap: 'balance' as never, textShadow: '0 2px 30px rgba(0,0,0,.85)' }}>
          {words.map((w, i) => {
            const at = inAt + 2 + i * 1.3, k = interpolate(f, [at, at + 13], [0, 1], { ...clamp, easing: out })
            const hot = w.startsWith('*')
            return (
              <span key={i} style={{ display: 'inline-block', marginRight: '0.24em', opacity: k, transform: `translateY(${(1 - k) * 14}px)`, filter: k < 1 ? `blur(${(1 - k) * 8}px)` : undefined, color: hot ? accent : undefined }}>
                {w.replace(/\*/g, '')}
              </span>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}

// Dark band under the captions so they read on any footage.
export const Band: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(12,11,9,.55) 0%, transparent 16%, transparent 52%, rgba(12,11,9,.92) 100%)', opacity, pointerEvents: 'none' }} />
)

// Chapter rail: where we are in the tour of the seven views.
export const Hud: React.FC<{ chapter: number; label: string; progress: number }> = ({ chapter, label, progress }) => {
  const f = useCurrentFrame()
  const tick = interpolate(f, [0, 8], [0, 1], { ...clamp, easing: out })
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, height: 4, width: `${progress * 100}%`, background: C.cob, boxShadow: `0 0 16px ${C.cob}` }} />
      <div title={label} style={{ position: 'absolute', top: 40, right: 120, display: 'flex', gap: 8, opacity: tick }}>
        {[1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} style={{ width: i === chapter ? 46 : 18, height: 6, borderRadius: 3, background: i < chapter ? C.ink2 : i === chapter ? C.cob : C.rule, boxShadow: i === chapter ? `0 0 12px ${C.cob}` : undefined }} />
        ))}
      </div>
    </AbsoluteFill>
  )
}

// The site's mark: a ring with a live centre.
export const Mark: React.FC<{ size: number; glow?: number }> = ({ size, glow = 1 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', border: `${Math.max(2, size / 14)}px solid ${C.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: size * 0.32, height: size * 0.32, borderRadius: '50%', background: C.verm, boxShadow: `0 0 ${size * 0.4 * glow}px ${C.verm}` }} />
  </div>
)

// A scan line sweeps down at each cut.
export const Wipe: React.FC = () => {
  const f = useCurrentFrame()
  if (f > 9) return null
  const y = interpolate(f, [0, 8], [-4, 104])
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: C.cob, opacity: interpolate(f, [0, 2, 6], [0.22, 0.1, 0], clamp) }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${y}%`, height: 3, background: C.cob, boxShadow: `0 0 40px 10px ${C.cob}` }} />
    </AbsoluteFill>
  )
}

// Film grain and faint scanlines, as on the site's Phosphor theme.
export const Grain: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity: 0.2 }}>
      <svg width="100%" height="100%">
        <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={Math.floor(f / 2) % 12} /></filter>
        <rect width="100%" height="100%" filter="url(#n)" opacity={0.5} />
      </svg>
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 1px, transparent 1px 3px)' }} />
    </AbsoluteFill>
  )
}

// R2, held-out (docs/CLAIMS.md: r2-requests, r2-primary, r2-combined).
export const R2Stat: React.FC<{ inAt: number; outAt: number }> = ({ inAt, outAt }) => {
  const f = useCurrentFrame()
  if (f < inAt || f > outAt + 10) return null
  const k = interpolate(f, [inAt, inAt + 14], [0, 1], { ...clamp, easing: out }), leave = interpolate(f, [outAt, outAt + 9], [0, 1], clamp)
  const pct = interpolate(f, [inAt + 34, inAt + 70], [0, 99.7], { ...clamp, easing: out })
  const row2 = interpolate(f, [inAt + 30, inAt + 40], [0, 1], clamp)
  return (
    <div style={{ position: 'absolute', right: 110, top: 200, width: 610, padding: '34px 40px', borderRadius: 6, background: 'rgba(21,19,15,.92)', border: `1px solid ${C.rule}`,
      boxShadow: '0 30px 80px rgba(0,0,0,.6)', opacity: k * (1 - leave), transform: `translateX(${(1 - k) * 60 + leave * 30}px)`, fontFamily: F.mono }}>
      <div style={{ fontSize: 19, letterSpacing: 4, color: C.mute, marginBottom: 26 }}>R2 · HELD-OUT · 14 SESSIONS</div>
      <div style={{ fontSize: 22, color: C.ink2 }}>Rebuilt exactly from transcript lines alone</div>
      <div style={{ fontFamily: F.display, fontSize: 92, fontWeight: 700, color: C.verm, lineHeight: 1.1 }}>0 <span style={{ fontSize: 44, color: C.mute }}>of 2,049</span></div>
      <div style={{ height: 1, background: C.rule, margin: '22px 0' }} />
      <div style={{ opacity: row2 }}>
        <div style={{ fontSize: 22, color: C.ink2 }}>Sealed with stored blobs + rebuild</div>
        <div style={{ fontFamily: F.display, fontSize: 92, fontWeight: 700, color: C.mint, lineHeight: 1.1 }}>{pct.toFixed(1)}%</div>
        <div style={{ fontSize: 18, color: C.mute, marginTop: 10 }}>per-session mean · each checked against the record's own hash</div>
      </div>
    </div>
  )
}

export const EndCard: React.FC<{ inAt: number }> = ({ inAt }) => {
  const f = useCurrentFrame()
  if (f < inAt) return null
  const k = (d: number, len = 14) => interpolate(f, [inAt + d, inAt + d + len], [0, 1], { ...clamp, easing: out })
  return (
    <AbsoluteFill style={{ background: `rgba(12,11,9,${0.86 * k(0, 18)})`, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36, opacity: k(4), transform: `scale(${0.94 + 0.06 * k(4)})` }}>
        <Mark size={120} glow={1 + Math.sin(f / 6) * 0.3} />
        <div style={{ fontFamily: F.display, fontSize: 190, fontWeight: 700, color: C.ink, letterSpacing: -4, lineHeight: 1 }}>assay</div>
      </div>
      <div style={{ fontFamily: F.display, fontSize: 52, fontWeight: 600, color: C.ink, opacity: k(14), transform: `translateY(${(1 - k(14)) * 20}px)`, textAlign: 'center', lineHeight: 1.15 }}>
        Check the record. <span style={{ color: C.cob }}>Then read the run.</span>
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 34, color: C.cob, letterSpacing: 2, opacity: k(26), marginTop: 10, padding: '14px 30px', border: `1px solid ${C.rule}`, borderRadius: 4 }}>
        1ash0.github.io/assay
      </div>
    </AbsoluteFill>
  )
}
