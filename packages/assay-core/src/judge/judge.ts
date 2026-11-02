// Judge plane (ARCHITECTURE "Judge plane", Rule 6, ADR-035). Optional and off
// by default: nothing in import, Health or the view calls a judge. A judge's
// answer is always `model-judged` with its probability, kept apart from
// deterministic verdicts, and it only ever sees redacted input.

export interface JudgeAnswer {
  kind: 'model-judged'
  judge: string        // adapter id and model, e.g. "groq:llama-3.3-70b-versatile"
  p: number | null     // probability of "yes"; null when the call failed or the reply was unusable
  error?: string
}

export interface Judge {
  id: string
  ask(input: string, question: string): Promise<JudgeAnswer>
}

// Masking applied to anything a judge sees (on top of dropping identity fields
// at the source). Emails, key- and token-shaped strings, and long hex ids.
const MASKS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, '‹email›'],
  [/\b(gsk|sk|ghp|gho|xox[abpr]|AKIA)[_-]?[A-Za-z0-9]{16,}\b/g, '‹key›'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '‹hex›'],
  [/[A-Za-z]:\\Users\\[^\\\s"]+/g, '‹home›'],
  [/\/(home|Users)\/[^/\s"]+/g, '‹home›'],
]
const DROP_KEYS = /^(resource_attributes|.*\.account\..*|.*account_id|.*project\.id|.*user_id|.*email)$/i

export function redactForJudge(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactForJudge)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !DROP_KEYS.test(k)).map(([k, x]) => [k, redactForJudge(x)]))
  }
  if (typeof v === 'string') return MASKS.reduce((s, [re, r]) => s.replace(re, r), v)
  return v
}
