// One piece of real site footage with a virtual camera and a cursor.
// The camera runs a smooth spline through its keys (position and log-zoom), so
// it never stops dead at a waypoint, and keeps its last velocity past the final
// key so the shot is still moving while the next one dissolves in. The
// recording has no pointer, so a cursor glides to each recorded click.
import { AbsoluteFill, Easing, Freeze, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { C, H, W } from './theme'

export type Key = { f: number; x: number; y: number; s: number }
type Click = { t: number; x: number; y: number }

// Cubic Hermite through the keys, tangents from neighbours (Catmull-Rom on a
// non-uniform time axis); linear with the end tangent outside the key range.
function spline(ts: number[], vs: number[], f: number) {
  const n = ts.length
  if (n === 1) return vs[0]
  const m = (i: number) => i === 0 ? (vs[1] - vs[0]) / (ts[1] - ts[0]) : i === n - 1 ? (vs[n - 1] - vs[n - 2]) / (ts[n - 1] - ts[n - 2]) : (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - ts[i - 1])
  if (f <= ts[0]) return vs[0] + m(0) * (f - ts[0]) * 0.5
  if (f >= ts[n - 1]) return vs[n - 1] + m(n - 1) * (f - ts[n - 1]) * 0.5
  let i = 0
  while (ts[i + 1] < f) i++
  const h = ts[i + 1] - ts[i], u = (f - ts[i]) / h, u2 = u * u, u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m(i) + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m(i + 1)
}
export function camAt(keys: Key[], f: number) {
  if (!keys.length) return { x: W / 2, y: H / 2, s: 1 }
  const ts = keys.map(k => k.f)
  const s = Math.max(1, Math.exp(spline(ts, keys.map(k => Math.log(k.s)), f)))
  const cl = (v: number, half: number, size: number) => Math.min(size - half / s, Math.max(half / s, v))
  return { s, x: cl(spline(ts, keys.map(k => k.x), f), W / 2, W), y: cl(spline(ts, keys.map(k => k.y), f), H / 2, H) }
}

const glide = Easing.bezier(0.45, 0, 0.2, 1)
function cursorAt(cs: { at: number; x: number; y: number }[], f: number) {
  if (!cs.length) return null
  const first = cs[0], last = cs[cs.length - 1]
  const show = interpolate(f, [first.at - 30, first.at - 22, last.at + 22, last.at + 32], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  if (show <= 0) return null
  let x = first.x + 240, y = first.y + 170
  const pts = [{ at: first.at - 30, x, y }, ...cs, { at: last.at + 40, x: last.x + 50, y: last.y + 40 }]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.min(26, b.at - a.at - 2), t0 = b.at - 2 - len
    if (f >= a.at) { const k = glide(interpolate(f, [t0, b.at - 2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })); x = a.x + (b.x - a.x) * k; y = a.y + (b.y - a.y) * k }
  }
  const press = cs.some(c => Math.abs(f - c.at) < 3) ? 0.82 : 1
  return { x, y, show, press }
}

export const Shot: React.FC<{ clip: string; from: number; rate: number; dur?: number; keys?: Key[]; clicks?: Click[]; soften?: number[] }> = ({ clip, from, rate, dur = 9999, keys = [], clicks = [], soften = [] }) => {
  const f = useCurrentFrame()
  const { x, y, s } = camAt(keys, f)
  // Clicks in this shot's frames; a click with no room to be seen coming is dropped,
  // and of two clicks a few frames apart only the later one is drawn.
  const cs = clicks.map(c => ({ at: ((c.t - from) / rate) * 30, x: c.x, y: c.y })).filter(c => c.at >= 8 && c.at < dur)
    .filter((c, i, a) => !(a[i + 1] && a[i + 1].at - c.at < 12))
  const cur = cursorAt(cs, f)
  return (
    <AbsoluteFill style={{ background: C.ground, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: W, height: H, transformOrigin: '0 0', transform: `translate(${W / 2 - x * s}px, ${H / 2 - y * s}px) scale(${s})` }}>
        <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} trimBefore={Math.round(from * 30)} playbackRate={rate} muted style={{ width: W, height: H }} />
        {/* The site swaps views instantly; hold the frame before a swap and fade it off. */}
        {soften.map(t => {
          const at = ((t - from) / rate) * 30, o = interpolate(f, [at, at + 7], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          if (f < at || o <= 0) return null
          return <Freeze key={t} frame={Math.round(t * 30) - 1}><OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} muted style={{ position: 'absolute', inset: 0, width: W, height: H, opacity: o }} /></Freeze>
        })}
        {cs.map((c, i) => {
          const k = (f - c.at) / 18
          if (k < 0 || k > 1) return null
          return <div key={i} style={{ position: 'absolute', left: c.x - 50, top: c.y - 50, width: 100, height: 100, borderRadius: '50%', border: `${2.5 / s}px solid ${C.cob}`, transform: `scale(${0.25 + 0.75 * Easing.out(Easing.cubic)(k)})`, opacity: 0.8 * (1 - k) }} />
        })}
        {cur && (
          <svg width={30} height={42} viewBox="0 0 30 42" style={{ position: 'absolute', left: cur.x, top: cur.y, opacity: cur.show, transformOrigin: '0 0', transform: `scale(${(1.15 / s) * cur.press})`, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.6))' }}>
            <path d="M2 2 L2 33 L10 25.5 L15.5 38 L21 35.6 L15.6 23.3 L26 23.3 Z" fill={C.ink} stroke="#0c0b09" strokeWidth={2.2} strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </AbsoluteFill>
  )
}
