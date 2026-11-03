// Post cover, 1920×1080. A real frame of the Rebuild view behind a dark scrim,
// the two held-out R2 numbers (docs/CLAIMS.md: r2-primary, r2-requests,
// r2-combined) as the hook, and the mark. Scope is stated on the image.
import { AbsoluteFill, Img, staticFile } from 'remotion'
import { Mark } from './Overlays'
import { C, F } from './theme'

export const Thumb: React.FC = () => (
  <AbsoluteFill style={{ background: C.ground, fontFamily: F.display }}>
    <Img src={staticFile('clips/thumb-bg.png')} style={{ position: 'absolute', inset: 0, width: 1920, height: 1080, filter: 'blur(5px) saturate(.8)', opacity: 0.55, transform: 'scale(1.06)' }} />
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(12,11,9,.97) 0%, rgba(12,11,9,.86) 46%, rgba(12,11,9,.35) 100%)' }} />
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.6) 100%)' }} />

    <div style={{ position: 'absolute', left: 110, top: 96, display: 'flex', alignItems: 'center', gap: 22 }}>
      <Mark size={64} />
      <div style={{ fontSize: 60, fontWeight: 700, color: C.ink, letterSpacing: -2 }}>assay</div>
    </div>

    <div style={{ position: 'absolute', left: 110, top: 250, width: 1150 }}>
      <div style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: 7, color: C.cob, marginBottom: 30 }}>CLAUDE CODE TELEMETRY · HELD-OUT TEST</div>
      <div style={{ fontSize: 126, fontWeight: 700, lineHeight: 1.03, letterSpacing: -3.5, color: C.ink }}>
        Can you <span style={{ color: C.ochre }}>prove</span><br />what your agent<br />actually saw?
      </div>
    </div>

    <div style={{ position: 'absolute', right: 110, top: 232, width: 560, padding: '40px 44px', borderRadius: 8, background: 'rgba(21,19,15,.9)', border: `1px solid ${C.rule}`, boxShadow: '0 40px 100px rgba(0,0,0,.7)', fontFamily: F.mono }}>
      <div style={{ fontSize: 21, color: C.ink2 }}>Rebuilt from transcript lines alone</div>
      <div style={{ fontFamily: F.display, fontSize: 138, fontWeight: 700, color: C.verm, lineHeight: 1.05, margin: '8px 0 4px' }}>0 <span style={{ fontSize: 50, color: C.mute }}>of 2,049</span></div>
      <div style={{ height: 1, background: C.rule, margin: '24px 0' }} />
      <div style={{ fontSize: 21, color: C.ink2 }}>Sealed by the record’s own hash</div>
      <div style={{ fontFamily: F.display, fontSize: 138, fontWeight: 700, color: C.mint, lineHeight: 1.05, marginTop: 8 }}>99.7%</div>
      <div style={{ fontSize: 17, color: C.mute, marginTop: 14 }}>14 held-out sessions · one user · Claude Code 2.1.299+</div>
    </div>

    <div style={{ position: 'absolute', left: 110, bottom: 84, fontFamily: F.mono, fontSize: 28, color: C.ink2, letterSpacing: 2 }}>
      open source · runs locally · <span style={{ color: C.cob }}>1ash0.github.io/assay</span>
    </div>
  </AbsoluteFill>
)
