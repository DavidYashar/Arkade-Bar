# Arkade Bar

A 3D arcade bar you can walk into, in the browser. Blender authors the room and the
cabinets, three.js plays them, and every cabinet is a real, playable game.

Built for Funtico. React 19, TypeScript, Vite 7, React Three Fiber, Tailwind 4, Rapier
for the tables that need physics.

## Run

```bash
npm install
npm run dev      # web on http://localhost:3400, api on 8787 (proxied at /api)
npm run build    # typecheck + production build
npm test         # vitest
```

## What is in the bar

- **Neon Pinball**, a full table with flippers, bumpers, drop targets and a plunger lane.
- **Brick Blitz**, a wall of bricks that marches toward your end of the table.
- **Rescue Boat**, a top-down river run with a gun, a fuel gauge and bridges to break.
- **Darts**, five rounds of three darts at a real board, with the chalk written on the wall.
- **Blackjack**, a six-hand table with a dealer, a clock and a round summary.
- **A jukebox** that plays a shuffled set of tracks, projects a live spectrum on the wall,
  and follows you around the room in spatial audio.

## Controls

Desktop: the door opens as you approach. Arrows walk, drag to look, keys `H` `S` `D` play
blackjack hands, `N` opens Rescue Boat, `Escape` backs out of a game.

Phone: four arrows at the bottom left walk, a finger drag looks around, and every game
carries its own thumb controls. Each game keeps its speaker beside Stand up, so the game
can be muted without leaving it.

## Layout

```
src/arcade/      the 3D bar: room, cameras, walking, interaction, loader
src/games/       one folder per game, each with its own audio and rules
src/lib/         shared helpers: samples, game sound switch
server/          the only server code: health today, grading and settlement later
art/             Blender build scripts for every prop, plus their source images
public/          exported glTF, textures, audio and fonts that ship with the app
docs/            decisions, the card contract, the Funtico launch questions
```

## Assets

Models are built by the Python scripts in `art/` (Blender), then exported to
`public/models/`. Textures live in `public/textures/`, big maps as KTX2 through the Basis
transcoder in `public/basis/`. Music is royalty free. The display font is Uncial Antiqua
(SIL Open Font License). See `THIRD-PARTY.md`.

## Where this is going

- **More cabinets.** The room is built to take them; a new game is a folder in
  `src/games/`, a cabinet in `art/`, and one entry in the scene.
- **A real server.** `server/index.ts` is a health check today. It is where run grading
  and Funtico settlement belong.
- **Code splitting.** The main bundle is one large chunk; the games should load on demand.
- **Balance passes.** The jukebox level, brick row pacing and blackjack timings are all
  single constants that would benefit from playtesting on real devices.
- **The test suite.** `patrol.test.ts` shares state with other files and fails
  intermittently in a full run while passing alone.
