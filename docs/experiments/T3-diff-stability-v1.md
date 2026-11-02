# EXP-T3 Run Diff alignment stability v1 (preregistration, 2026-11-02, before any alignment code)
- **Question:** Does Run Diff's alignment stay the same when a run is changed in ways that do not change what happened, and does it move to the right place when something real changes?
- **Truth badge of data used:** `real-perturbed`. Perturbations are applied in memory to the 20 real R2 sessions; nothing is written to the corpus.
- **Sessions / n:** all 20 R2 sessions, each paired with each perturbation, so the unit is the (session, perturbation) pair. There is no dev/held-out split, because no rule is tuned on these.
- **Alignment (fixed now):**
  - Each spine step (one per LLM request, main transcript first) gets the key = the sorted multiset of its tool-call names, so parallel calls are unordered.
  - Two runs are aligned by longest common subsequence over keys, with **exact key equality only** (Rule 5).
  - The first divergence is the first index where the two key sequences differ, or null when they are identical.
- **Benign perturbations (alignment must be identical, divergence null):**
  1. **reorder:** within each assistant message that streams two or more tool-call lines, reverse the order of those lines;
  2. **rename:** replace every occurrence of `scratchpad` with `scratchpaX` in every line (paths change, tool names do not);
  3. **rewrite:** write the first assistant line of every fifth message a second time, right after itself (the harness's duplicate-record behaviour; ADR-029).
- **Negative control (a real change, which must be found):** delete the assistant line carrying the middle tool call of the session, along with that tool call's result line. The first divergence must be at the step that held it, or no later than it if that step held only the deleted call.
- **Primary metric (fixed now):** stability = share of (session, benign perturbation) pairs whose alignment equals the unperturbed alignment of the session with itself (every step matched, divergence null).
- **Secondary:** detection = share of negative-control pairs whose first divergence is at the expected step index.
- **Analysis:** shares with a 95% bootstrap CI over sessions (10,000, seed 26).
- **Stopping rule:** one run after the alignment code is committed.
- **Threats:**
  - The perturbations are ours. A real benign change we did not think of (for example a retried request) is not covered.
  - Keys ignore tool inputs. Two runs that call the same tools with different arguments align perfectly, which is by design (inputs are provenance's job) and must be stated wherever Diff is shown.
  - The subagent order of steps depends on file order.
- **What would change my mind:** any benign perturbation moving the divergence. That would mean the key encodes something incidental.
- **Real twin runs:** none exist yet. This experiment measures stability, not whether real twin runs align well. The twin-run protocol is in `docs/M4_PLAN.md`.
- **Result artifact path:** `results/T3-diff-stability-v1.json`, summarised in `T3-diff-stability-v1.result.md`.
