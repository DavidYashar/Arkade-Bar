# Cards

The deck is being designed. This is the contract it must meet.

| | |
|---|---|
| Files | 53: 52 faces and `back.webp` |
| Names | `<RANK><SUIT>.webp`: `AC` … `KS`, plus `back` |
| Ranks | `A 2 3 4 5 6 7 8 9 10 J Q K` |
| Suits | `C` clubs, `D` diamonds, `H` hearts, `S` spades |
| Aspect | 2:3 portrait |
| Size | 800 x 1200 preferred, 444 x 666 is the current floor |
| Edges | art fills the image, rounded corners and border baked in |
| Format | WebP, sRGB; PNG accepted and converted |
| Weight | keep the set under about 4 MB |

Screen sizes the art must read at: 74 to 80 px on a phone, 92 on a tablet, 132 to 142 on a
desktop, up to 340 in the hero, 54 on a split hand.

Where they go: `public/cards/`.

Two choices still open: a single ink style for all suits, or suit-tinted; and one back design
or one per tier.
