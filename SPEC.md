# SPEC — The Secret Formula

A single-file chemistry puzzle for one specific player: a 22-year-old autistic man who
likes systems, exact rules, and real detail. Everything below is a constraint that
outranks elegance.

## 1. Product

A browser game in which the player balances real chemical equations to reconstruct a
stolen recipe. Static, offline-capable, one HTML file, no dependencies, no network, no
build step.

## 2. Player requirements (the reason the design looks like this)

| Requirement | Consequence in the build |
|---|---|
| Predictable | Fixed rule set; no RNG, no hidden state, no chance events |
| No time pressure | No timer, no countdown, no scoring by speed; gate asserts no `setTimeout`/`setInterval` |
| Failure is informative, never destructive | Unbalanced state shows exact per-element differences; no lives, no lockouts |
| Recoverable | Unlimited undo; restart returns to the deterministic seed; save after every action |
| Explicit rules | Written rules dialog, reaction note per equation, always-visible atom ledger |
| Sensory control | Audio off until enabled; calm mode; `prefers-reduced-motion` respected; no flashing, no shake, no particles |
| Motor access | Full keyboard operation; ≥32 px touch targets on phones; no right-click or long-press requirement |
| Adult substance | Real stoichiometry, redox chemistry, molar masses — not children's content |
| No social pressure | Local-only progress, no accounts, no leaderboards, no streaks |

## 3. Learning model

The subject is the game, not a skin over it.

- **Atom conservation** is displayed, not asserted: a live ledger of left/right counts and
  a signed delta per element.
- **Why coefficients and not subscripts**: the formulas are immutable in the UI, which is
  the actual chemistry rule the player must internalise.
- **Simplest whole numbers**: accepted either way, with an explicit note when the player
  balances with multiples.
- **Molar mass** is computed, not tabulated, and printed on both sides once balanced, so
  conservation of mass is something the player can see.
- **Nomenclature**: the element reference lists symbol, name, atomic number and standard
  atomic weight for everything the game uses.

## 4. Chemistry model

For an equation with species `s` (reactants positive, products negative) and elements `e`:

    A[e][s] = (atoms of e in s) x sign(s)

The balance is the null space of `A`. The build ships only species lists; coefficients are
**derived**, never stored.

`solve()` requirements:
- exact rational arithmetic (BigInt num/den) — no floating point in the solver;
- nullity must be exactly 1, otherwise the level is rejected at build time;
- the null vector is normalised to the smallest positive integers;
- the solver's own answer is re-checked against the atom ledger before it is returned.

## 5. Data

48 equations across five chapters (10 synthesis, 8 decomposition, 9 combustion,
10 replacement, 11 redox). Maximum shipped coefficient is 25, so the UI cap is 30.
Element table: 41 elements with standard atomic weights.

## 6. Interaction

- `−`/`+` buttons per compound; `←`/`→` to select, `↑`/`↓` to adjust, `1`–`9` to set.
- Undo stack (per equation), restart to seed, three-tier hint ladder:
  1. general method;
  2. the element furthest out, with its two counts;
  3. one exact coefficient (never the whole answer).
- Solved state is committed immediately and permanently recorded.

## 7. Non-goals

- No accounts, no server, no analytics, no external assets.
- No multiple-choice quizzing — the input is the chemistry itself.
- No difficulty ramp by timer; difficulty is element/species count only.
- Not a general chemistry editor: species are fixed per level.

## 8. Acceptance criteria

1. All 48 equations solve to a unique positive-integer ratio, in lowest terms.
2. No equation is solvable at its seeded start state.
3. Every equation solves through the real DOM (not just the core) in headless Chrome.
4. Zero console errors across a full session including a reload.
5. No horizontal overflow at 1500 / 1024 / 768 / 390 / 320 px.
6. Undo, restart and persistence round-trip exactly.
7. Reduced motion measurably disables transitions.
8. No `[hidden]` element occupies layout space.
9. Audio is off on first load.
10. The deploy serves bytes identical to the gated artifact.
