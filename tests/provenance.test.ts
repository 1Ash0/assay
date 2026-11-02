import { describe, expect, it } from 'vitest'
import { extractLiterals, locate, provenanceFromLines } from '../packages/assay-core/src/reconstruct/provenance.js'

describe('provenance literals (P4 preregistration)', () => {
  it('takes string values of 8+ characters and path-like tokens, never descriptions or numbers', () => {
    const lits = extractLiterals({ command: 'cat docs/ROADMAP.md | head', description: 'Show the roadmap file', n: '12345678', short: 'ls' })
    expect(lits).toContain('cat docs/ROADMAP.md | head')
    expect(lits).toContain('docs/ROADMAP.md')
    expect(lits).not.toContain('Show the roadmap file')
    expect(lits).not.toContain('12345678')
    expect(lits).not.toContain('ls')
  })

  it('finds the earliest exact occurrence, and calls a literal with none unsourced', () => {
    const at = locate(['docs/ROADMAP.md', 'E:\\assay\\docs\\ROADMAP.md'],
      [{ type: 'text', text: 'system' }], [],
      [{ role: 'user', content: 'read docs/ROADMAP.md' }, { role: 'assistant', content: [{ type: 'text', text: 'docs/ROADMAP.md again' }] }])
    expect(at[0]!.at).toEqual({ part: 'message', index: 0, block: 0 })
    // Exact match only: the absolute path never appeared, so it is unsourced.
    expect(at[1]!.at).toBeNull()
  })

  it('falls back to earlier transcript lines in the same file, and says so', () => {
    const [p] = provenanceFromLines(
      [{ id: 't', input: { file_path: 'src/app/main.ts' }, file: 'a.jsonl', line: 5 }],
      [{ file: 'a.jsonl', line: 2, text: 'see src/app/main.ts' }, { file: 'a.jsonl', line: 9, text: 'later src/app/main.ts' }, { file: 'b.jsonl', line: 1, text: 'src/app/main.ts' }],
    )
    expect(p!.source).toBe('l1-lines')
    expect(p!.literals[0]!.at!.index).toBe(2)
  })
})
