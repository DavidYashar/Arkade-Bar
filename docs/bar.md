# The bar

Concept: the card table inside the long bar (C in A). Grand but controlled.

## Numbers

Room 14 x 18 m, ceiling 4.2 m. Entrance on the front wall at y = -9, bar across the back at
y = +9. Card table dead centre at (0, -2). Three cabinets on the left wall, two on the right,
all turned 75 degrees into the room. Lounge with a sofa in the front left corner. Four game
tables down the middle.

## Cameras

1. street: the facade and the sign
2. doorway: just inside, the bar at the end of the room
3. corner left: the card table, the bar, the right cabinet bank
4. table: over the shoulder of a player
5. cabinets: the left bank, the ghost sign above
6. bar: the counter and the bottle wall

## Palette

ink, walnut, brick, concrete, leather, brass; amber light for the room, magenta and cyan for
the neon, violet for the cabinets.

## Budget, when this stops being a blockout

under 200k triangles, under 120 draw calls, under 10 MB, baked light, no runtime shadows,
one bloom pass for the neon, alpha cards for plants, instanced bottles.

## Built by

`art/build_blockout.py`, run with `blender -b --python art/build_blockout.py`. Everything is
numbers in the script, so a change is a number and a rebuild, not surgery in the editor.
