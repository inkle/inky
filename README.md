<div align="center">

<img src="resources/icon-small.jpg" alt="Inky application icon" width="80">

<h1>Inky</h1>

<p><strong>Write with ink. Bring your stories to life.</strong></p>

<p>An independent community fork of <a href="https://github.com/inkle/inky">inkle's Inky</a>, extending the desktop editor for <a href="https://github.com/inkle/ink">ink</a> with visual story presentation, a live player, multimedia scenes, and web export.</p>

<p>
  <a href="https://github.com/inkle/inky"><img src="https://img.shields.io/badge/upstream-Inky%200.15.2-4764ac" alt="Based on Inky 0.15.2"></a>
  <img src="https://img.shields.io/badge/community_revision-r109-30876c" alt="Community revision r109">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>

<a href="docs/screenshots/default-first-open.png">
  <img src="docs/screenshots/default-first-open.png" alt="Inky's default project, The Borrowed Star, in the editor beside its title screen" width="1000">
</a>

<p><em>The first-open experience: <strong>The Borrowed Star</strong>, ready to read, explore, and edit.</em></p>

</div>

> **An independent fork.** Inky and the ink language were created by [inkle](https://www.inklestudios.com/ink/). This project builds on their work; it is not affiliated with or endorsed by inkle Ltd. Original Ink syntax and branching logic remain at its core.

## Write a story. See it come alive.

Write in Ink on the left. Follow the story on the right. As you revise dialogue, add branches, or change presentation settings, the live Preview helps you understand what the reader will experience.

<a href="docs/screenshots/live-preview-basic-passage.png">
  <img src="docs/screenshots/live-preview-basic-passage.png" alt="Inky's Visual settings beside a live passage with title, narrative text and interactive choices" width="1000">
</a>

*A passage with a title, narrative text, and choices, shown alongside the Visual settings that shape its appearance.*

Inky keeps the writing workflow familiar: syntax highlighting, autocomplete, reusable snippets, issue reporting, a project Explorer, and interactive story navigation. This fork adds control over the way that writing reaches the screen.

## Shape the reader's experience

The **Visual** tab makes presentation adjustable without requiring custom CSS. Settings are stored with the project in `game.yaml`; **Advanced** provides access to the underlying configuration.

| Presentation | Reader experience |
| :-- | :-- |
| **Classic, Night, Sepia, and Terminal** themes | Distinct looks, with optional light/dark switching |
| **Fonts, sizes, spacing, and alignment** | Readable layouts in a portrait **9:16** frame |
| **Title Screen** | Cover image, title, author, and a title-size control in pixels |
| **Sound controls** | Adjustable master, music, and effects volume |
| **Story endings** | Optional **The End** marker and **Play Again** button |

The Title Screen and the reading passages are separate: a scene background does not overwrite the cover. Stories can be kept minimal or given a more illustrated identity.

### Two ways to present Ink

**Traditional Mode** retains the continuous reading style of the original Inky. **Screen Mode** presents individual passages as clean, self-contained screens while leaving Ink variables, choices, and diverts intact.

Screen Mode is optional. Enable it under **Visual → Story presentation** and introduce a screen with `#screen`:

```ink
=== bridge ===
#screen
#title: Voices in the Snow

The old bridge groans beneath the weight of winter.

+ [Climb toward the star.] -> hill
```

### Images, backgrounds, music, and sound

Scene tags let a writer give each passage its own look and atmosphere:

```ink
=== bridge ===
#screen
#bg: image/background/reading-texture.png
#image: image/scene/bridge-bell.jpg
#music: audio/music/bridge-mist.mp3
#sound: audio/sfx/bell.wav
#title: Voices in the Snow

The old bridge groans beneath the weight of winter.

+ [Climb toward the star.] -> hill
```

`#image` places artwork above the passage; `#bg` sets an image behind the scene content. `#title` introduces the passage title, while `#music` and `#sound` control audio. Resource folders are conventions rather than restrictions: project-relative paths are supported.

## Meet Before Dawn

**Before Dawn** is this fork's official showcase: a short fantasy adventure designed to demonstrate what an Ink story can become when writing, artwork, sound, and reader presentation work together.

It is a **real, editable project**, included with the source. Open it through **Ink → Full stories** to explore its branching narrative, scene assets, choices, and three endings.

<a href="docs/screenshots/showcase-editor-before-dawn.png">
  <img src="docs/screenshots/showcase-editor-before-dawn.png" alt="The Before Dawn project open in Inky: Ink source, audio files, images, and illustrated Title Screen" width="1000">
</a>

*A single Before Dawn project in the Explorer, with its Ink source, original assets, and live Title Screen in the Preview.*

### Start with a cover

<div align="center">

<a href="docs/screenshots/showcase-title-screen.png">
  <img src="docs/screenshots/showcase-title-screen.png" alt="Before Dawn's illustrated Title Screen with the story title, author credit, Start and Load" width="390">
</a>

<p><em>The actual Title Screen in the Inky Preview: cover, title, author credit, Start, and Load.</em></p>

</div>

### Give each passage its own atmosphere

A scene can combine **top artwork**, **background texture**, **scene title**, **narrative text**, and **choices**. The illustration can change between passages while the reading frame remains consistent.

<div align="center">

<a href="docs/screenshots/showcase-scene-old-forge.png"><img src="docs/screenshots/showcase-scene-old-forge.png" alt="The Old Forge captured in Inky: a passage with top illustration, dark textured background, title, narrative and branching choices" width="46%"></a>
<a href="docs/screenshots/showcase-scene-voices-in-the-snow.png"><img src="docs/screenshots/showcase-scene-voices-in-the-snow.png" alt="Voices in the Snow captured in Inky: another illustrated passage with its own image, title, story text and interactive choices" width="46%"></a>

<p><em>The Old Forge</em> · <em>Voices in the Snow</em> — two actual passages captured from <strong>Before Dawn</strong> in the Inky Preview.</p>

</div>

Music and sound effects can accompany the scenes without being written into the narrative itself. The showcase includes both, alongside its cover, scene images, and alternate outcomes.

Explore the [story source](app/resources/showcase/before-dawn/Before%20Dawn.ink) and [project settings](app/resources/showcase/before-dawn/game.yaml) to see how the pieces fit together. **Elias Wren** is a fictional author credit for the showcase.

## Built on the original Inky

The original editor's full-story examples remain available as a tribute to the work that came before this fork:

- **Crime Scene** — from *Writing with Ink*
- **Swindlestones** — from *Sorcery!*
- **Pontoon Game** — from *Overboard!*
- **The Intercept**

In **Ink → Full stories**, these appear together **above a divider**, with **Before Dawn** displayed separately beneath it. Opening a story creates an editable project, with compatibility adjustments for this fork's reader where needed.

**The Borrowed Star**, meanwhile, is the starter story presented when Inky is opened without an existing project. It is not part of the original Inky collection or the illustrated showcase.

## Take your story to the web

Use **File → Export for web** to produce a browser-playable story with its Ink content, reader interface, styles, and referenced local assets. The export supports scene presentation, Title Screens, and reader controls, including save/load and configurable endings.

Preview and Web Export are developed to behave consistently. Before publishing, test the exported `index.html` and its assets in a browser.

## Download and run

The community **r109** build targets **Linux x86-64**. Download the `.deb` or AppImage from the project's [GitHub Releases](https://github.com/glassflare/inky/releases) when this revision is published.

**Debian / Ubuntu**

```bash
sudo apt install ./inky-r109-upgrade-compatible.deb
```

**AppImage**

```bash
chmod +x Inky-0.15.2-109-x86_64.AppImage
./Inky-0.15.2-109-x86_64.AppImage
```

Some Linux distributions may require FUSE compatibility libraries for AppImage. The source tree also includes scripts for other platforms; these downloads are Linux builds.

### Build from source

You'll need Node.js, npm, Git, and the system libraries required by Electron.

```bash
git clone https://github.com/glassflare/inky.git
cd inky/app
npm ci
npm start
```

To run the project's tests from `app/`:

```bash
npm test
npm run test:web-export
```

The underlying application version remains **0.15.2**; **r109** identifies this fork's community revision.

## Contribute

Issues and improvements are welcome through [GitHub Issues](https://github.com/glassflare/inky/issues). When reporting a problem, include your operating system, build revision, steps to reproduce it, and whether it occurs in Preview, Web Export, or both.

## Credits and license

The original [Inky](https://github.com/inkle/inky) editor and [ink](https://github.com/inkle/ink) language are by **inkle Ltd**. This independent fork preserves the original story examples with their historical credits. Distributed under the [MIT License](LICENSE), subject to applicable upstream and third-party notices.