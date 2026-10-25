# Original build (reference only)

`original-build/` is the unmodified compiled extension "ESUIT | Photos Downloader for Instagram™"
v3.13.2 that the TypeScript source in `src/` was reverse-engineered from. It is not part of the build;
it is kept so the analysis in [docs/REVERSE_ENGINEERING.md](../docs/REVERSE_ENGINEERING.md) can be
checked, and `tests/parity.test.ts` extracts functions from it to compare behaviour.

Its FFmpeg core (`ffmpeg/ffmpeg-core.{js,wasm}`) was moved to `public/ffmpeg/`, where the new build
uses it.
