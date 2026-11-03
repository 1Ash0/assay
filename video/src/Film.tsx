// The launch film: 50 s, 1920×1080, 30 fps. Cold open on a laptop, a dive into
// its screen, a tour of the seven views on one real run, then a pull back out.
// Cuts sit on the music's bar lines (timeline.json); shots dissolve into each
// other while the outgoing camera keeps moving, and the Runs → Report and
// Learn shots are continuous takes with matched cameras.
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import T from './timeline.json'
import { Key, Shot } from './Shot'
import { Laptop, LogScreen } from './Laptop'
import { Band, Caption, EndCard, Grain, Hud, R2Stat } from './Overlays'
import { C } from './theme'
import runs from '../public/clips/runs.json'
import report from '../public/clips/report.json'
import scan from '../public/clips/scan.json'
import timeline from '../public/clips/timeline.json'
import rebuild from '../public/clips/rebuild.json'
import compare from '../public/clips/compare.json'
import learn from '../public/clips/learn.json'

const CLICKS: Record<string, { t: number; x: number; y: number }[]> = { runs: runs.clicks, report: report.clicks, scan: scan.clicks, timeline: timeline.clicks, rebuild: rebuild.clicks, compare: compare.clicks, learn: learn.clicks }

// Camera per shot, in the shot's own frames (clip pixels, zoom). Few keys,
// gentle zooms; a shot's first key matches the last of a continuous take.
const k = (f: number, x: number, y: number, s: number): Key => ({ f, x, y, s })
const CAM: Record<string, Key[]> = {
  runs: [k(0, 960, 470, 1.22), k(58, 960, 340, 1.4), k(100, 860, 320, 1.32), k(132, 760, 300, 1.3)],
  report: [k(0, 760, 300, 1.3), k(55, 1180, 250, 1.42), k(110, 760, 760, 1.48), k(150, 700, 830, 1.55), k(190, 960, 760, 1.15), k(211, 960, 800, 1.18)],
  scan: [k(0, 905, 600, 1.12), k(60, 905, 560, 1.38), k(132, 905, 430, 1.32)],
  timeline: [k(0, 760, 300, 1.42), k(132, 1180, 300, 1.48)],
  rebuild: [k(0, 1150, 620, 1.15), k(24, 1182, 470, 1.3), k(46, 900, 640, 1.25), k(66, 600, 840, 1.6), k(122, 640, 800, 1.5), k(148, 700, 700, 1.4), k(185, 960, 420, 1.2), k(264, 1300, 420, 1.35)],
  compare: [k(0, 900, 400, 1.12), k(133, 520, 430, 1.7)],
  learnA: [k(0, 1100, 380, 1.15), k(30, 1380, 400, 1.32), k(66, 1050, 560, 1.35), k(110, 700, 600, 1.3)],
  learnB: [k(0, 700, 600, 1.3), k(24, 1100, 520, 1.5), k(46, 960, 540, 1.22), k(88, 960, 520, 1.45)],
}

// Instant view swaps inside a take (clip seconds) that get a short blend.
const SOFTEN: Record<string, number[]> = { runs: [runs.clicks[0].t], learnA: [learn.clicks[2].t], learnB: [] }

// Captions: [start, end] in film frames.
const CAPS: { at: number; end: number; kicker?: string; text: string; accent?: string }[] = [
  { at: 140, end: 262, kicker: '01 · Runs', text: 'assay reads the *record* before anything else.' },
  { at: 272, end: 365, kicker: '02 · Report', text: 'A Capture Level and a trust score, *before* any number.' },
  { at: 372, end: 454, text: 'Summing every line says *20,195* output tokens. Counted once: *5,320*.', accent: C.ochre },
  { at: 471, end: 586, kicker: '03 · Scan', text: '*14* detector gates, replayed line by line.' },
  { at: 603, end: 718, kicker: '04 · Timeline', text: 'Every step at its own timestamp. Links only where *ids match*.' },
  { at: 870, end: 980, kicker: '05 · Rebuild', text: 'Rebuild what the model actually saw, sealed by the *record’s own hash*.', accent: C.mint },
  { at: 1000, end: 1114, kicker: '06 · Compare', text: 'Twin runs: same prompt, same commit. They split at *step 1*.', accent: C.ochre },
  { at: 1132, end: 1272, kicker: '07 · Learn', text: 'Slip a lie past it: nudge one copy from *3* to *8*.', accent: C.ochre },
  { at: 1286, end: 1385, text: 'Caught by *D6*, down to the exact bytes.', accent: C.ochre },
]

const Cold: React.FC = () => {
  const f = useCurrentFrame()
  const open = interpolate(f, [4, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const zoom = interpolate(f, [T.cold.diveAt, T.cold.dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Laptop open={open} zoom={zoom} orbit={f * 0.05}><LogScreen f={f} freezeAt={78} /></Laptop>
      <Band opacity={1 - zoom} />
      <Caption text="Your AI agent writes its own *logs*." inAt={12} outAt={72} center size={84} />
      <Caption text="Should you *believe* them?" inAt={80} outAt={118} center size={96} accent={C.ochre} />
    </AbsoluteFill>
  )
}

const Outro: React.FC = () => {
  const f = useCurrentFrame()
  const zoom = interpolate(f, [0, 60], [1, 0], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Laptop open={1} zoom={zoom} orbit={-(f * 0.04)}><Shot clip="learn" from={T.outro.from} rate={T.outro.rate} keys={[k(0, 960, 520, 1.45), k(44, 960, 540, 1)]} /></Laptop>
      <EndCard inAt={T.outro.cardAt} />
    </AbsoluteFill>
  )
}

// A zoom-through: the outgoing shot pushes past the viewer and softens while
// the incoming one arrives into place, so every cut moves forward. A
// continuous take (cont) cuts straight, and a shot followed by one does not exit.
const ease = Easing.bezier(0.4, 0, 0.2, 1)
const Dissolve: React.FC<{ cont?: boolean; exits: boolean; dur: number; children: React.ReactNode }> = ({ cont, exits, dur, children }) => {
  const f = useCurrentFrame()
  const e = cont ? 1 : ease(Math.min(1, f / T.fade)), x = exits ? ease(Math.max(0, Math.min(1, (f - dur) / T.fade))) : 0
  return (
    <AbsoluteFill style={{ opacity: e, transform: `scale(${(0.955 + 0.045 * e) * (1 + 0.07 * x)})`, filter: e < 1 || x > 0 ? `blur(${(1 - e) * 7 + x * 9}px)` : undefined }}>
      {children}
    </AbsoluteFill>
  )
}

// The frame breathes on the music's beat during the tour, a little harder on
// each bar, and blooms at the two payoffs.
const BEAT = (60 / T.music.bpm) * T.fps
const Chrome: React.FC = () => {
  const f = useCurrentFrame() + T.shots[0].start
  const s = [...T.shots].reverse().find(x => x.start <= f) ?? T.shots[0]
  const b = (f - T.music.dropAt) / BEAT, ph = b - Math.floor(b), bar = Math.floor(b) % 4 === 0
  const build = interpolate(f, [T.shots[0].start, T.outro.start], [0.6, 1])
  const pulse = Math.exp(-ph * 5) * (bar ? 1 : 0.45) * build
  const bloom = (at: number, colour: string) => { const k = interpolate(f, [at - 2, at + 3, at + 30], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }); return k > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 55%, ${colour}38, transparent 65%)`, opacity: k, mixBlendMode: 'screen' }} /> : null }
  return (
    <>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,.55) 100%)', opacity: 1 - 0.35 * pulse, pointerEvents: 'none' }} />
      <AbsoluteFill style={{ boxShadow: `inset 0 0 ${120 + 60 * pulse}px rgba(115,211,223,${0.05 * pulse})`, pointerEvents: 'none' }} />
      {bloom(T.events.sealed, C.mint)}
      {bloom(T.events.caught, C.ochre)}
      <Band />
      <Hud chapter={s.chapter} label={s.label} progress={(f - T.shots[0].start) / (T.outro.start - T.shots[0].start)} />
    </>
  )
}

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.ground }}>
    <Sequence durationInFrames={T.cold.dur + T.fade}><Cold /></Sequence>
    {T.shots.map((s, i) => (
      <Sequence key={s.id} from={s.start} durationInFrames={s.dur + T.fade}>
        <Dissolve cont={'cont' in s && s.cont} exits={!!T.shots[i + 1] && !('cont' in T.shots[i + 1] && T.shots[i + 1].cont)} dur={s.dur}>
          <Shot clip={s.clip} from={s.from} rate={s.rate} dur={s.dur} keys={CAM[s.id]} clicks={CLICKS[s.clip]} soften={SOFTEN[s.id]} />
          {s.id === 'rebuild' && <R2Stat inAt={80} outAt={176} />}
        </Dissolve>
      </Sequence>
    ))}
    <Sequence from={T.shots[0].start} durationInFrames={T.outro.start - T.shots[0].start}><Chrome /></Sequence>
    <Sequence from={T.outro.start} durationInFrames={T.outro.dur}><Outro /></Sequence>
    {CAPS.map((c, i) => (
      <Sequence key={i} from={c.at} durationInFrames={c.end - c.at + 10}>
        <Caption kicker={c.kicker} text={c.text} inAt={0} outAt={c.end - c.at} accent={c.accent} />
      </Sequence>
    ))}
    <Grain />
    <Audio src={staticFile(T.music.file)} trimBefore={Math.round(T.music.offset * 30)}
      volume={f => interpolate(f, [0, 24, T.frames - 75, T.frames - 4], [0, T.music.volume, T.music.volume, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    <Audio src={staticFile('audio/sfx.wav')} />
  </AbsoluteFill>
)
