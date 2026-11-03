// Synthesises the film's sound effects from src/timeline.json and the recorded
// clicks, to sit under the music track: the lid, the agent typing, the glitch
// on the freeze, a soft blip per click, a chime when the request seals and a
// low hit when D6 catches the lie. No samples, so nothing to license.
// Usage: node sound.mjs  ->  public/audio/sfx.wav
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const T = JSON.parse(readFileSync('src/timeline.json', 'utf8'))
const SR = 48000, N = Math.ceil((T.frames / T.fps) * SR)
const L = new Float32Array(N), R = new Float32Array(N)
const sec = f => f / T.fps
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

function add(t0, dur, fn, gain = 1, pan = 0) {
  const a = Math.floor(t0 * SR), n = Math.floor(dur * SR)
  for (let i = 0; i < n && a + i < N; i++) { if (a + i < 0) continue; const v = fn(i / SR, i / n) * gain; L[a + i] += v * (1 - pan); R[a + i] += v * (1 + pan) }
}

// Lid opening, then the agent typing until the freeze.
add(sec(6), 0.4, (t, p) => Math.sin(2 * Math.PI * (70 - 30 * p) * t) * (1 - p) ** 2, 0.3)
for (let f = 10; f < 78; f += 2.2) add(sec(f), 0.018, (t, p) => rnd() * (1 - p) ** 3, 0.05, rnd() * 0.4)
add(sec(78), 0.28, (t, p) => Math.sign(Math.sin(2 * Math.PI * 180 * t + 3 * Math.sin(t * 90))) * rnd() * (1 - p) ** 2, 0.07)

// Click blips, at the clicks the film draws (same rule as Shot.tsx).
for (const s of T.shots) {
  const clicks = JSON.parse(readFileSync(`public/clips/${s.clip}.json`, 'utf8')).clicks
    .map(c => ((c.t - s.from) / s.rate) * T.fps).filter(at => at >= 8 && at < s.dur)
  clicks.filter((at, i, a) => !(a[i + 1] && a[i + 1] - at < 12))
    .forEach(at => add(sec(s.start + at), 0.05, (t, p) => Math.sin(2 * Math.PI * 2200 * t) * (1 - p) ** 2, 0.06, 0.15))
}

// Sealed chime and the D6 catch.
add(sec(T.events.sealed), 1.4, (t) => (Math.sin(2 * Math.PI * 880 * t) + 0.6 * Math.sin(2 * Math.PI * 1320 * t)) * Math.exp(-4 * t), 0.08)
add(sec(T.events.caught), 1.4, (t, p) => Math.sin(2 * Math.PI * (62 - 22 * p) * t) * Math.exp(-2.8 * t), 0.35)
add(sec(T.events.caught), 0.8, (t) => [523.3, 622.3, 784].reduce((v, h) => v + Math.sin(2 * Math.PI * h * t), 0) / 3 * Math.exp(-5 * t), 0.08)

const buf = Buffer.alloc(44 + N * 4)
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22)
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.tanh(L[i]) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.tanh(R[i]) * 32767), 46 + i * 4) }
mkdirSync('public/audio', { recursive: true })
writeFileSync('public/audio/sfx.wav', buf)
console.log(`sfx.wav: ${(N / SR).toFixed(1)} s`)
