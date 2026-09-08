# Dead Giveaway

A top-down shooter whose enemy learns to play by watching you play.

**[deadgiveaway.windnoise.org](https://deadgiveaway.windnoise.org)** — runs in the
browser, nothing to install.

## What it is

You fight one opponent, the Mirror. It starts knowing nothing — every weight in
the layer that decides what it does is zero. Every second you are alive it is
watching how you move, when you shoot, how you use cover and when you reload, and
it is learning from that **while you play**, every frame, with a further study
pass between rounds. It does not follow rules someone wrote for it. It copies you.

**The first few seconds look like nonsense, and that is what an empty brain looks
like.** With nothing learned, every decision is an even coin flip, so it opens by
firing, reloading and turning at random. It has the keys and no idea when to
press them. That does not last: over one minute, the only difference being
whether the player pulled a trigger, it went from 6 shots to 56.

So the way it fights is the way *you* fight, a few rounds behind. Change your
habits and it follows you into the new ones. Keep them, and it gets very good at
beating the person who has them.

The panels around the arena are not decoration. They read the live model: what
it can see from where it stands, which controls it is reaching for right now,
how much of its behaviour is now yours, and where it is still guessing. Each
one has a **?** in its heading — hover it for how to read that panel, click to
pin it open.

Every number on them is an **edge over a control**: the score something that
learned nothing would get, subtracted. Zero does not mean broken, it means no
better than the obvious answer — and a habit you never demonstrate stays at
zero honestly rather than being credited to the model.

## Controls

| | |
|---|---|
| `W` `A` `S` `D` | move |
| mouse | aim |
| click | shoot |
| `R` | reload |
| right-drag | rotate the view |
| double-click the cube | snap the view back |
| `Space` | pause |

Rotating or zooming the view brings up a small map in the top-left corner
showing the same fight from the default angle, so you keep track of which way
`W` `A` `S` `D` point. It goes when you snap the view back. The keys never
change meaning - they stay locked to the room, not the camera.

Twenty rounds to a magazine. It reloads on the same key and the same timer you
do, and it had to learn when — from you, habit and all.

Measured, it has learned *that* you reload, and that you do it as the magazine
runs down. It has not learned *how far* you let it run. Against a player who
fights down to their last few rounds it still tops up early — firing about five
rounds between reloads where they fire fourteen, and never once being caught
empty where they spend 8% of a fight that way. A real gap, honestly one of the
two things most worth fixing next.

## Your data

Nothing leaves the browser. There is no account, no analytics, no server and no
network request of any kind. The model of you is saved in your own browser's
storage — so the Mirror can remember you between sessions — and never anywhere
else.

It can also leave as a file, on your say-so. **save to file** in the dock writes
the rival's whole brain to your downloads; **load file** brings one back, in this
browser or another. A download is a file on your machine and nothing more — still
no network. If a browser ever loses its storage, that file is the only copy, so
save one after a session you would mind losing.

When a saved rival exists, the game asks before anything happens. **Continue**
picks the fight back up. **Quick play** faces a blank Mirror and keeps nothing
from that session — your saved rival is untouched. **New story** erases the
rival for good, once you confirm it, and that card is the only thing in the
game that erases the memory. Erasing is permanent.

## Licence

Copyright © 2026 Windnoise. All rights reserved.

This is source-available, not open source. You may read it. You may not copy,
modify, redistribute or use it, in whole or in part, without written permission.
See [LICENSE](LICENSE).

---

DEAD GIVEAWAY · A WINDNOISE SOLUTION · [HXXFX](https://github.com/HXXFX)
