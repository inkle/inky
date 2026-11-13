# Live Preview text rendering

The reading passage needs a hard top clip over scrolled history. An alpha gradient
mask on that scrolling text produced displaced glyph fragments with GPU rasterization
in Electron 30.5.1 / Chromium 124 on Linux. DOM text, paragraph and character geometry
remained unchanged while a new raster/composition cleared the displayed fragments.

The Preview now uses `clip-path: inset(var(--story-top-cover, 0px) 0 0)` for the same
hard edge, avoiding the text alpha-mask surface. This changes the Preview's clipping
primitive, not Ink compilation, pagination, animations or the embedded Chromium code.
The Web Export implementation is unchanged.

The investigation reproduced the title fixture on 20/20 cold starts before the change
and 0/20 afterward. Restoring only the old mask in the corrected package restored
the failure on 20/20 starts. The user also validated the corrected build locally.

`app/test/legendary-25-as-regression.test.js` keeps the original 25-letter fixture and
the leading-blank variant. Its Linux/X11 tests capture real displayed pixels before
layout reads and compare them with an independently rasterized reference. The suite
also checks actual editing, recompilation, window resizing and the scrolled top clip.
An occluded window is excluded from cold-start counts rather than counted as success.

Run the graphical suite with `INKY_RUN_VISUAL_TESTS=1 INKY_VISUAL_REQUIRED=1` and a
GPU-enabled X11 session. Other environments skip the opt-in graphical cases; release
validation requires them and records the actual GPU feature status.
