# BNBChain Hackathon Project Template

Different hackathons have different requirements. This repo is a **recommended structure** that, as a judge, I find makes submissions easier to evaluate and more likely to get a fair, complete read. Use it as a guide; adapt it to whatever your specific event asks for.

---

## Why This Structure Helps

Judges typically rely on **what’s written in your repository**—together with your code—as the main basis for scoring. When key information lives in one place and follows a clear layout, it’s easier to assess your project consistently. This template is designed with that in mind: it’s the kind of structure I recommend as a judge, not a set of universal rules.

---

## What I Recommend Including

| Suggested content              | Where to put it           |
| ------------------------------ | ------------------------- |
| Project overview               | `README.md`               |
| Problem, solution, impact, roadmap | `docs/PROJECT.md`     |
| Architecture, setup, demo      | `docs/TECHNICAL.md`       |
| Contract addresses (if you have them) | `bsc.address` (root) |

**On-chain projects:** Many judges appreciate a single address file at the repo root. This template includes **`bsc.address`** for that. If your hackathon or judges expect something similar, filling it in (and keeping it verifiable) tends to help on-chain evaluation.

---

## Optional Extras

Demo videos and slide decks are **mostly for presentation**—pitches, finalist demos, or sharing with audiences. As a technical judge, I mainly **dive into the code and run the project myself**. What helps me most is a repo that’s **easy to get running**: clear setup steps in `docs/TECHNICAL.md` and reproducible instructions. Making it easy to start is far more helpful than a video or slides.

If you still want to share a demo or deck, you can add links in **`docs/EXTRAS.md`**. Having those links in the repo makes them easy to find; for technical evaluation, I still rely on the code and documentation first.

---

## A Note on What Judges Can Reasonably Score

In practice, judges usually base scores on **what’s in the repo**. Information that appears only in slides, or only in a demo video, is harder to verify and compare across teams. So I recommend documenting your problem, solution, architecture, and usage in the repo; treat slides and video as support, not the main source of truth.

---

## Suggested Repository Layout

```
/README.md
/bsc.address              ← Deployments: contracts, addresses, explorer links (on-chain projects)
/docs/
    PROJECT.md            ← Problem, solution, business, limitations
    TECHNICAL.md          ← Architecture, setup, demo guide
    EXTRAS.md             ← Optional: demo video & presentation links
/src/                     ← Your project source code
/test/                    ← Tests (if applicable)
```

---

## Quick Start

1. **Fork or use this template** and rename the repo to your project name.
2. **Fill in** `README.md`, `docs/PROJECT.md`, and `docs/TECHNICAL.md` so judges have a clear picture of your project.
3. **Add your code** under `src/` (and tests under `test/` if you have them).
4. **If you deploy contracts**, consider filling `bsc.address` (contract names, addresses, explorer links) so judges can easily find and verify them.
5. **Submit** your GitHub repository link according to your hackathon’s instructions.

Good luck! 🚀
