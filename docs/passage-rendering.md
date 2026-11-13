# Complete passage rendering

The Preview used a 450 ms fade for every paragraph, heading and choice, separated
by at least 80 ms. It also paginated on paragraph tags while native compiler IPC
messages were still arriving. The Web Export independently staggered elements by
200 ms. These intentional delays made each passage visibly assemble after Start
or a choice, even when Ink had already generated its content. A paginated clone
could also inherit an unfinished paragraph's zero opacity.

Passages now appear without per-element fades in both players. The Preview
collects the native turn after a choice and keeps the previous passage visible.
At the input prompt or ending it applies the text, tags, media, expressions and
choices in one JavaScript task, then paginates the complete turn. Repeated clicks
cannot submit another choice while that turn is pending. A new compilation
discards stale queued content; runtime errors also finish the pending update.

Web Export already generates a whole turn synchronously. Removing its reveal
timers and opacity transition makes the browser paint that completed turn at its
next frame, after its final pagination. Media loading, audio fades, accessibility
preferences, source maps, paragraph gaps and Save/Load retain their behavior.
Images can still take time to download or decode; a slow or unavailable image
does not block the story.

On the release machine, with animations enabled and the same eight-paragraph
story, the old/new measurements were:

| Action | r114 | r115 |
| --- | ---: | ---: |
| Preview choice | 1170 ms | 22 ms |
| Preview ending | 470 ms | 10 ms |
| Web Start | 1833 ms | 25 ms |
| Web choice | 1808 ms | 9 ms |
| Web ending | 220 ms | 12 ms |

These are local measurements, not timing guarantees. No incoming partial passage
was observed in the corrected run. Preview choice layout passes fell from 29 to
4. Start in a fully prepared Preview was already immediate.

Run the real Chromium/native-compiler regression from app/:

    INKY_PERF_REQUIRE_ATOMIC=1 node test/helpers/passage-render-check.cjs /path/to/Inky NEW_OUTPUT_DIRECTORY

The helper uses isolated profiles, checks Start, choices and endings, and runs an
actual compiler-backed export in a browser window without Node integration.
It records frame observations and Chromium layout metrics. Node/npm development
dependencies and a graphical session are required. npm test additionally checks
turn buffering, single pagination after 100 paragraphs, duplicate-click handling,
error/ending output and cancellation by a newer compiler session.
