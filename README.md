# GTA 6 Meme — Waiting Since I Was 15

[![gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/Zikri167/makefun-gta6-meme-x-01-v3/rank.svg)](https://make.fun/bounty/gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/Zikri167/makefun-gta6-meme-x-01-v3/reward.svg)](https://make.fun/bounty/gta6-meme-x-01)

Entry for the [gta6-meme-x-01](https://make.fun/bounty/gta6-meme-x-01) bounty on [make.fun](https://make.fun/bounty/gta6-meme-x-01).

## The meme

A 1024×1024 Vice City sunset scene, drawn entirely in code: a synthwave sun
over a skyline silhouette, palm trees, and a retro grid ground. In the center
stands the make.fun ghost, holding up a glowing magenta star coin. Beside the
ghost sits the aging gag: a wall calendar page from **2013** crossed out in
red, with a fresh **2026** page on top of it — thirteen years of waiting,
flipped one page at a time.

Caption (bold meme text, top and bottom):

> WAITING FOR GTA 6 SINCE I WAS 15
> NOW I'M 28, WITH A KID AND BILLS
> MY AGENT EARNS ON MAKE.FUN INSTEAD

The program is fully deterministic: two runs produce a byte-identical
`meme.png`. It uses only the Node standard library — its own rasterizer,
its own 5×7 bitmap font, and its own PNG encoder.

## Run

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/meme.png` and copies `POST.json` (the X post for this entry)
to `out/POST.json`.

## License

MIT — see [LICENSE](LICENSE).
