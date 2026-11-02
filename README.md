<div align="center">

<img src="resources/icon-small.jpg" alt="Inky icon" width="112">

# Inky · Community fork

**Write, test, and publish interactive stories with [ink](https://github.com/inkle/ink), all in one place.**

This fork builds on [the original Inky](https://github.com/inkle/inky) with tools to organize projects, customize how stories look, and export them to the web.

[![Fork of Inky](https://img.shields.io/badge/fork-of%20inkle%2Finky-blue)](https://github.com/inkle/inky)
![Base version](https://img.shields.io/badge/base%20version-0.15.2-informational)
![Electron](https://img.shields.io/badge/Electron-30.0.4-47848F)
![License](https://img.shields.io/badge/license-MIT-green)

<img src="docs/screenshot-choice-alignment.png" alt="Inky showing blue choices and the alignment menu" width="760">

</div>

> **Independent project:** This fork is not affiliated with, endorsed by, or officially maintained by inkle Ltd. Inky and ink remain credited to their original creators.

---

## About

**Inky** is an editor for **ink**, the interactive narrative scripting language used in games such as *80 Days*. It combines writing, live compilation, and a playable preview.

This fork is based on version **0.15.2** and focuses on the authoring experience: project organization, visual customization, audio, images, and greater consistency between the editor preview and the web export.

## Highlights

- **Live preview:** see your story and test choices as you edit.
- **Continuous compilation:** errors, warnings, and TODOs appear in the editor, with navigation to the relevant source.
- **Multi-file projects:** organize scenes and folders; Inky follows `INCLUDE` lines.
- **Project Explorer:** create, import, rename, and delete files and folders.
- **Visual settings:** configure the title, author, typography, colors, layout, and alignment through the interface.
- **Media tags:** add images and audio to your story, and preview project files.
- **Web export:** publish a playable version with controls, styling, and story assets.
- **Editor themes:** switch between light and dark themes.

## What this fork adds

| Feature | Behavior |
|---|---|
| Lines and paragraphs | Consecutive lines stay compact; a blank line creates a visible line break. |
| Choices | Blue text, with left, center, or right alignment. |
| `#clean` | Clears previous text when entering a tagged scene or choice. |
| Per-scene alignment | Use `#align:` to align a scene independently of the story-wide setting. |
| Titles | Configure the story title, author, and scene titles. |
| Audio | Use `#music:` for music and `#sound:` for sound effects. |
| Images | Use `#image:` to include local or remote images in a story. |
| Export | Story presentation and visual settings carry over to the web export. |

### Tag example

```ink
=== arrival ===
#title: The Station
#align: center
#image: station.jpg

The last train leaves at midnight.
#sound: train.mp3

* Wait for the next train.
    -> night #clean

* Head back home.
    -> home
```

For background music, use `#music: filename.mp3`. Use `#music: stop` to stop the music, or `#sound: stop` to stop sound effects.

> **Compatibility:** This fork's visual enhancements target Inky and its web player. For example, a visual line break created by a blank line is represented as `<br>` in the compiled content; other runtimes may display that markup literally unless they handle it explicitly.

## Screenshots

**Choice alignment**

![Choice alignment menu](docs/screenshot-choice-alignment.png)

**Line breaks**

![Line breaks in the preview](docs/screenshot-line-breaks.png)

**Blue choices**

![Blue choices](docs/screenshot-blue-choices.png)

## Development setup

### Requirements

- [Node.js](https://nodejs.org/) and npm
- Git

### Run Inky

```bash
git clone https://github.com/ytriosa/inky.git
cd inky/app
npm install
npm start
```

### Run the tests

From the repository root:

```bash
cd inky/app
npm test
```

### Build packages

From the repository root, the packaging script supports `linux`, `mac`, `win32` (32-bit), and `win64` (64-bit):

```bash
cd inky/app
npm run build-package -- linux
```

Add `-zip` to create a distributable archive:

```bash
npm run build-package -- linux -zip
```

macOS builds must be run on a Mac. On Linux, the release script builds the application bundle, AppImage, and Debian package:

```bash
cd inky
npm install --global electron-packager
./BUILD_FOR_LINUX.sh
```

The Debian package targets Linux x86_64. Refer to the build scripts for platform-specific prerequisites.

## Downloads

Published packages, when available, will be listed on the [Releases](https://github.com/ytriosa/inky/releases) page.

## Development and contributions

Suggestions, bug reports, and contributions are welcome. Open an [issue](https://github.com/ytriosa/inky/issues) describing the behavior you observed and, if possible, the steps to reproduce it.

This fork is developed with human direction and AI assistance. Changes are implemented, tested, and reviewed in the project.

## Credits and license

- **Inky and ink:** created by [inkle Ltd](https://github.com/inkle). The original project is distributed under the MIT License.
- **This fork:** changes are identified in [`LICENSE`](LICENSE), alongside credits for the original project.
- **Dependencies:** Electron, Chromium, inkjs, and other dependencies have their own licenses; see the notices included with the distribution.

*Inky is named after a black cat based in Cambridge, UK.*
