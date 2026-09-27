# Snowbound — SkiFree-style HTML5 Game

A self-contained downhill skiing game built with HTML5 Canvas, CSS, and vanilla JavaScript.

## Run

No server or build system is required.

Open `index.html` in a modern desktop browser.

For a local server instead:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

## Controls

- Left / Right or A / D — steer
- Up / W — tuck / accelerate
- Down / S — brake
- Space — jump
- P / Escape — pause

Touch controls appear automatically on touch devices.

## Features

- Procedurally generated endless downhill terrain
- Skiing acceleration, steering, jumping, and crashes
- Trees, rocks, moguls, ramps, snowmen, and signs
- Trick scoring
- Increasing difficulty
- Abominable snow monster after 2,500 meters
- Local high-score storage
- Responsive canvas
- No external libraries or assets

## Files

- `index.html` — game shell/UI
- `src/style.css` — presentation and responsive layout
- `src/game.js` — complete game engine
- `assets/` — reserved for optional future art/audio

## Notes

This project uses original programmatic artwork and gameplay rather than copying the original game's proprietary sprites or sounds.
