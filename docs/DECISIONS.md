# Decisions

## Stack

- Vite + React 19 + TypeScript, a single page app. No server rendering: the product is a
  canvas, and the Funtico parts that need a server are one small service.
- three.js through React Three Fiber, with drei for helpers and postprocessing for bloom.
- Tailwind v4 for the DOM interface around the canvas.
- Zustand for state shared between the interface and the scene.
- Hono (Node 20+) for grading runs and settling Funtico matches. Same deploy as the static
  bundle on Render.
- Blender 5.2 authors the room, bakes light, exports glTF. three.js plays it.

## Rebuild

The game, the arcade space and the bar are built from scratch. The previous blackjack app is
reference, not source: its rules, scoring tables and tests are worth carrying over as
decisions, its markup is not.

## Open

- The card deck, being designed. 53 images, 2:3, names like 2C.webp and back.webp.
- Orientation of the bar: landscape first is the current recommendation.
- Which games share the bar with the blackjack duel.
- Funtico launch questions are parked in the Duel Dudes copy, notes/funtico-launch.md.

## Scope

Arkade Bar is the Funtico project. Everything for it lives in this folder: the bar, the
interface, the server, and every game under `src/games/`. Nothing from Bankroll is imported,
copied or shared. The old Duel Dudes app is reference only, and the original game repo stays
untouched for Bankroll.
