# Dead Giveaway

A top-down shooter whose enemy learns to play by watching you play.

**[deadgiveaway.windnoise.org](https://deadgiveaway.windnoise.org)** — runs in the
browser, nothing to install.

## What it is

You fight one opponent, the Mirror. It starts knowing nothing. Every second you
are alive it is recording how you move, when you shoot, how you use cover and
when you reload — and it is training on that recording between rounds. It does
not follow rules someone wrote for it. It copies you.

So the way it fights is the way *you* fight, a few rounds behind. Change your
habits and it follows you into the new ones. Keep them, and it gets very good at
beating the person who has them.

The panels around the arena are not decoration. They read the live model: which
of your keys it has learned, what it can see from where it stands, how much of
its behaviour is now yours, and where it is still guessing.

## Controls

| | |
|---|---|
| `W` `A` `S` `D` | move |
| mouse | aim |
| click | shoot |
| `R` | reload |
| right-drag | rotate the view |
| `Space` | pause |

Twenty rounds to a magazine. It reloads on the same key and the same timer you
do, and it had to learn when.

## Your data

Nothing leaves the browser. There is no account, no analytics, no server and no
network request of any kind. The model of you is built in memory while the tab is
open and is destroyed when you close it.

## Licence

Copyright © 2026 Windnoise. All rights reserved.

This is source-available, not open source. You may read it. You may not copy,
modify, redistribute or use it, in whole or in part, without written permission.
See [LICENSE](LICENSE).

---

DEAD GIVEAWAY · A WINDNOISE SOLUTION · [HXXFX](https://github.com/HXXFX)
