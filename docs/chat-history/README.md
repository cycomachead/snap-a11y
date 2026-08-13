# Chat history — Snap! / Morphic accessibility sessions

Markdown exports of the Claude Code sessions in which the parallel-DOM
screen-reader prototype was designed, built, and recovered. User and
assistant messages are included in full; tool calls appear as one-line
summaries (the full tool inputs/outputs live in the original `.jsonl`
transcripts under `~/.claude/projects/`).

| File | Sessions | What happened |
|---|---|---|
| [2026-06-morphic-a11y-build.md](2026-06-morphic-a11y-build.md) | June 29 – July 3, 2026 (`manual` workspace) | Architecture + phased build: Morphic core focus layer, menus, landmarks, toolbar/categories, palette, scripting area; the handoff doc |
| [2026-07-08-start-here-items-and-recovery.md](2026-07-08-start-here-items-and-recovery.md) | July 4 – Aug 8, 2026 (`snap-dev` workspace) | The six "start here" items (aria-live results, click→focus, exhaustive traversal, search pane, Shift+Enter bridge, rotor regions); recovery of the deleted prototype from transcripts; port into this repo |

The canonical technical handoff is [`accessibility-prototype.md`](../../accessibility-prototype.md)
in the repo root; the step-by-step build log is [`../morphic-a11y-devlog.md`](../morphic-a11y-devlog.md).
