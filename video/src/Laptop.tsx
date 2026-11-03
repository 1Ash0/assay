// A laptop in a dark room, seen from behind and to the side: the third-person
// observer. `zoom` 0 is the establishing shot; at 1 the screen exactly fills
// the frame, so a dive in or a pull out joins the footage without a cut.
import { AbsoluteFill, Easing, interpolate } from 'remotion'
import { C, F, H, W } from './theme'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const Laptop: React.FC<{ open: number; zoom: number; orbit?: number; glow?: number; children: React.ReactNode }> = ({ open, zoom, orbit = 0, glow = 1, children }) => {
  const z = zoom, g = glow * (0.4 + 0.6 * open)
  const ease = z * z * (3 - 2 * z)
  const scale = lerp(0.44, 1, ease)
  const rotY = lerp(-27 + orbit, 0, ease), rotX = lerp(-16, 0, ease), ty = lerp(-10, 0, ease), tx = lerp(-40, 0, ease)
  const lid = lerp(lerp(-90, 8, open), 0, ease) // degrees past upright; -90 is shut on the deck
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 50% 62%, #1d1a14 0%, ${C.ground} 70%)`, perspective: 2600, overflow: 'hidden' }}>
      {/* desk */}
      <div style={{ position: 'absolute', left: -400, right: -400, top: 690, bottom: -200, background: `linear-gradient(180deg, #17140f, #0a0907)`, opacity: 1 - ease, transform: `translateY(${ty * 0.5}px)` }} />
      <div style={{ position: 'absolute', width: W, height: H, transformStyle: 'preserve-3d', transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg)` }}>
        {/* deck: hinged to the bottom of the screen, reaching toward the viewer */}
        <div style={{ position: 'absolute', left: -150, width: W + 300, top: H, height: 1350, transformOrigin: '50% 0', transform: 'rotateX(90deg)', borderRadius: 34,
          background: `radial-gradient(1500px 700px at 50% 0%, rgba(115,211,223,${0.28 * g}), transparent 70%), linear-gradient(180deg, #38342b, #1f1c16)`,
          boxShadow: 'inset 0 0 0 3px #3a362d' }}>
          <div style={{ position: 'absolute', left: 170, right: 170, top: 90, height: 640, borderRadius: 12,
            background: 'repeating-linear-gradient(90deg, #0f0e0b 0 108px, transparent 108px 124px), repeating-linear-gradient(180deg, #0f0e0b 0 108px, transparent 108px 124px)', opacity: 0.9 }} />
          <div style={{ position: 'absolute', left: '50%', width: 760, marginLeft: -380, top: 800, height: 470, borderRadius: 18, background: '#221f19', boxShadow: 'inset 0 0 0 2px #36322a' }} />
        </div>
        {/* lid */}
        <div style={{ position: 'absolute', inset: 0, transformOrigin: '50% 100%', transform: `rotateX(${lid}deg)`, transformStyle: 'preserve-3d' }}>
          <div style={{ position: 'absolute', left: -70, right: -70, top: -70, bottom: -40, borderRadius: 40, background: '#0a0908', boxShadow: `0 0 0 3px #2c2922, 0 0 ${220 * g}px rgba(115,211,223,${0.18 * g})`, backfaceVisibility: 'hidden' }} />
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', backfaceVisibility: 'hidden', opacity: interpolate(open, [0.35, 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{children}</div>
          {/* the back of the lid, seen while it is shut */}
          <div style={{ position: 'absolute', left: -70, right: -70, top: -70, bottom: -40, borderRadius: 40, transform: 'rotateY(180deg) translateZ(2px)', backfaceVisibility: 'hidden',
            background: 'linear-gradient(160deg, #2e2b24, #16140f)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: F.display, fontSize: 150, color: '#46413a', letterSpacing: -2 }}>assay</div>
          </div>
        </div>
      </div>
      {/* vignette */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.75) 100%)', opacity: 1 - ease, pointerEvents: 'none' }} />
    </AbsoluteFill>
  )
}

// The agent writing its transcript. Rows are this run's own steps from the
// public, redacted spine (dist/site/runs/ef76e3fc.json): line numbers, kinds,
// token counts and tool names only, no content.
import log from '../public/log.json'
const KIND: Record<string, string> = { assistant: C.cob, tool_use: C.u, tool_result: C.mint }
export const LogScreen: React.FC<{ f: number; freezeAt: number }> = ({ f, freezeAt }) => {
  // Rows arrive continuously: the newest slides up from below the edge rather
  // than the whole block jumping a line at a time.
  const live = Math.min(f, freezeAt)
  const r = Math.min(log.rows.length, live / 2.6 + 3), shown = Math.min(log.rows.length, Math.floor(r) + 1)
  const frac = r >= log.rows.length ? 1 : r - Math.floor(r), slide = (1 - Easing.out(Easing.quad)(frac)) * 50
  const frozen = f >= freezeAt, k = f - freezeAt
  const jit = frozen && k < 26 ? Math.sin(k * 7.3) * 6 * Math.max(0, 1 - k / 26) : 0
  const rows = log.rows.slice(0, shown)
  const hi = rows.length - 4
  return (
    <AbsoluteFill style={{ background: '#090807', fontFamily: F.mono, color: C.ink2, padding: '70px 90px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: C.mute, borderBottom: `1px solid ${C.rule}`, paddingBottom: 22, marginBottom: 26 }}>
        <span><span style={{ color: frozen ? C.ochre : C.mint }}>●</span> agent session · writing its transcript</span>
        <span>{log.file.slice(0, 8)}….jsonl</span>
      </div>
      <div style={{ position: 'relative', height: 820, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', transform: `translateY(${frozen ? 0 : slide}px)` }}>
        {rows.map((r, i) => (
          <div key={i} style={{ opacity: i === rows.length - 1 && !frozen ? 0.35 + 0.65 * frac : 1, display: 'grid', gridTemplateColumns: '120px 250px 1fr', fontSize: 31, lineHeight: '50px', whiteSpace: 'nowrap',
            transform: frozen && i === hi ? `translateX(${jit}px)` : undefined,
            background: frozen && i === hi ? 'rgba(240,166,58,.14)' : undefined,
            textShadow: frozen && i === hi ? `${jit * 0.7}px 0 rgba(255,91,58,.7), ${-jit * 0.7}px 0 rgba(115,211,223,.7)` : undefined }}>
            <span style={{ color: C.mute }}>L{r.line}</span>
            <span style={{ color: KIND[r.kind] }}>{r.kind.replace('_', ' ')}</span>
            <span>{r.text}</span>
          </div>
        ))}
        {!frozen && <div style={{ width: 18, height: 34, background: C.ink, opacity: Math.floor(f / 8) % 2 ? 0 : 1, marginTop: 8 }} />}
      </div>
    </AbsoluteFill>
  )
}
