# Games

Every game lives here, one folder each. Nothing game-specific goes outside this folder.

```
src/games/
  blackjack/      the first game: six hands, one call each
  <next game>/    added when it is built
```

A game is a plain module with its own state and rules, testable without three.js:

- `rules.ts`      what is legal, what it scores
- `state.ts`      the state machine for one run
- `test/`         Vitest tests for the rules and the scoring

The arcade bar renders each game into a cabinet screen, and opens it full screen on click.
A game must not import three.js, and the scene must not contain game rules.
