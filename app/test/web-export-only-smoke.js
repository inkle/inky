const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildWebExport } = require("../renderer/webExporter.js");

describe("web export", function () {
    it("creates a complete web bundle without a standalone story JSON", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-export-"));
        const templateDirectory = path.join(__dirname, "../export-for-web-template");
        const targetDirectory = path.join(root, "web");
        const compiledJsonPath = path.join(root, "compiled.json");
        const inkRuntimePath = path.join(root, "ink.js");
        const story = { inkVersion: 21, root: ["hello"] };

        try {
            fs.writeFileSync(compiledJsonPath, JSON.stringify(story));
            fs.writeFileSync(inkRuntimePath, "ink runtime");

            const result = await buildWebExport({
                compiledJsonPath,
                targetDirectory,
                templateDirectory,
                inkRuntimePath,
                javascriptFilename: "main.js",
                storyTitle: "A Web Story",
                storyAuthor: "A <Writer> & Co",
                audioVolume: 37,
                audioMix: { master: 50, music: 11, sfx: 18 },
                cssAddition: ":root { --bg: #282828; --text: #faf1c6; }"
            });

            const outputFiles = fs.readdirSync(targetDirectory).sort();
            assert.deepStrictEqual(result.files.sort(), [
                "choice-text.js",
                "ending-marker.js",
                "favicon.ico",
                "index.html",
                "ink.js",
                "main.js",
                "pager.js",
                "richtext.js",
                "screen-mode.js",
                "story.js",
                "style.css"
            ]);
            assert.deepStrictEqual(outputFiles, result.files);

            const storyJs = fs.readFileSync(path.join(targetDirectory, "story.js"), "utf8");
            assert.deepStrictEqual(JSON.parse(storyJs.replace(/^var storyContent = |;\s*$/g, "")), story);
            const mainJs = fs.readFileSync(path.join(targetDirectory, "main.js"), "utf8");
            assert.doesNotMatch(mainJs, /setupTheme|theme-switch|themeSwitchEl/);
            assert.doesNotMatch(mainJs, /\.innerHTML\s*=/);
            assert.match(mainJs, /save-state:/);
            assert.match(mainJs, /stopSoundEffects/);
            assert.ok(mainJs.includes('if( /^stop$/i.test(splitTag.val) ) audioEngine.stopSoundEffects();'));
            assert.ok(mainJs.includes("choiceTags.forEach(processAudioTag);"));
            const outputCss = fs.readFileSync(path.join(targetDirectory, "style.css"), "utf8");
            const outputHtml = fs.readFileSync(path.join(targetDirectory, "index.html"), "utf8");
            assert.ok(outputHtml.includes('src="screen-mode.js"'));
            assert.ok(fs.existsSync(path.join(targetDirectory, "screen-mode.js")));
            assert.match(
                outputCss,
                /--bg: #282828; --text: #faf1c6;/
            );
            assert.match(outputCss, /\.story-hud \{[^}]*position: absolute;[^}]*inset: 0 0 auto;/);
            assert.doesNotMatch(outputCss, /#controls \{[^}]*position: fixed;|\.story-toolbar/);
            assert.doesNotMatch(outputCss, /height: calc\(100% - 58px\)|top: 58px/);
            assert.match(outputCss, /\.outerContainer \{[^}]*display: grid;[^}]*place-items: center;/);
            assert.match(outputCss, /\.container \{[^}]*width: min\(calc\(100cqw - 2 \* var\(--frame-gap, 24px\)\), var\(--width, 42rem\)/);
            assert.match(outputCss, /\.container \{[^}]*display: flex;[^}]*overflow: hidden;/);
            assert.match(outputCss, /\.story-passage \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;[^}]*scrollbar-width: none;[^}]*justify-content: safe center;/);
            assert.match(outputCss, /\.story-passage::-webkit-scrollbar \{\n    display: none;\n\}/);
            assert.match(outputCss, /\.audio-control \{\s+display: flex;\s+align-items: center;\s+gap: 8px;/);
            assert.match(outputCss, /\.audio-control input\[type="range"\] \{\s+flex: 1 1 auto;\s+min-width: 0;/);
            assert.match(outputCss, /\.toolbar-popover\[hidden\] \{[\s\S]*?display: none;/);
            assert.match(outputCss, /--line-height: 1\.7;/);
            assert.doesNotMatch(outputCss, /body\.dark|\.dark\s/);
            assert.doesNotMatch(outputCss, /@import/);
            assert.match(outputCss, /body \{\n    margin: 0;[\s\S]*?background: var\(--reader-outer-bg, #eeeeec\);/);
            assert.match(outputCss, /--frame-radius: clamp\(10px, 2vmin, 20px\)/);
            assert.match(outputCss, /\.container \{[^}]*box-shadow:\s*0 26px 58px -13px var\(--reader-shadow-deep/);
            assert.match(outputCss, /\.story-visual \{[^}]*flex: 0 0 27\.169%;/);
            assert.match(outputCss, /\.story-choices \{[^}]*flex: 0 0 auto;[^}]*max-height: 52%;/);
            assert.match(outputCss, /\.container\.has-choices \.story-passage \{[\s\S]*?margin-bottom: 0;/);
            assert.match(outputCss, /\.scroll-cue/);
            assert.match(outputCss, /\.container p\.choice \{[^}]*border-bottom: 1px solid color-mix\(in srgb, var\(--text, #000000\) 14%/);
            assert.match(outputCss, /\.container \.choice-button \{[^}]*display: block;[^}]*min-height: 44px;[^}]*color: var\(--link/);
            assert.match(outputCss, /\.container \.choice-button::after \{[^}]*border-right: 2px solid currentColor;/);
            assert.match(outputCss, /\.container \.choice-button:hover, \.container \.choice-button:focus-visible, \.container \.choice-button:active \{[^}]*box-shadow: inset 3px 0 0 var\(--link-hover/);
            assert.doesNotMatch(outputCss, /data-choices/);
            assert.match(outputCss, /\.container > p\.storyText \{ margin: 0; \}/);
            assert.match(outputCss, /\.container p \{[^}]*font-weight: normal;[^}]*line-height: var\(--line-height, 1\.7\);/);
            assert.match(outputHtml, /<body data-story-format="vertical" data-presentation="traditional" data-ending-show="on" data-ending-text="The End" data-play-again-show="on" data-play-again-text="Play Again" data-audio="off" data-volume="37" data-master-volume="50" data-music-volume="11" data-sfx-volume="18" data-theme-toggle="off" data-theme-initial="light" data-theme-alternate="light">/);
            assert.doesNotMatch(outputHtml, /data-layout=/);
            assert.match(outputHtml, /id="menu-toggle" class="toolbar-icon-button" aria-label="Story menu" aria-expanded="false" aria-controls="story-menu"/);
            assert.match(outputHtml, /<div id="story-menu" class="toolbar-popover" hidden>/);
            assert.match(outputHtml, /id="rewind" title="Restart story" aria-label="Restart story"/);
            assert.match(outputHtml, /id="audio-settings-anchor" hidden/);
            assert.match(outputHtml, /<button type="button" id="audio-toggle"[\s\S]*?<\/button>\s*<input type="range" id="audio-volume"[^>]*aria-label="Volume">/);
            assert.doesNotMatch(outputHtml, /<label for="audio-volume">Volume<\/label>/);
            assert.match(outputHtml, /<div id="story-passage" class="story-passage" hidden><\/div>/);
            assert.match(outputHtml, /<div id="story-choices" class="story-choices" hidden><\/div>/);
            assert.match(outputHtml, /<div id="story-visual" class="story-visual" hidden><\/div>/);
            assert.doesNotMatch(outputHtml, / \| <\/|id="controls" class="buttons"|story-toolbar|story-brand/);
            assert.doesNotMatch(outputHtml, /<header id="controls" class="story-toolbar">/);
            assert.match(
                outputHtml,
                /<title>A Web Story<\/title>/
            );
            assert.match(outputHtml, /<link rel="icon" href="favicon\.ico" type="image\/x-icon">/);
            assert.deepStrictEqual(
                fs.readFileSync(path.join(targetDirectory, "favicon.ico")),
                fs.readFileSync(path.join(templateDirectory, "favicon.ico"))
            );
            // The title and the author appear on the title screen only, not again in the play HUD
            assert.doesNotMatch(outputHtml, /story-identity/);
            assert.strictEqual((outputHtml.match(/Written by A &lt;Writer&gt; &amp; Co/g) || []).length, 1);
            assert.match(outputHtml, /<title>A Web Story<\/title>/);
            assert.doesNotMatch(outputHtml, /story-brand-title|story-brand-author|story-brand-copy/);
            assert.match(outputHtml, /<div id="story" class="container title-screen-active">\s*<header id="controls" class="story-hud">[\s\S]*?<\/header>\s*<div class="title-screen" id="title-screen"><div class="title-screen-body"><h1 class="title-screen-title">A Web Story<\/h1><div class="title-screen-author">Written by A &lt;Writer&gt; &amp; Co<\/div><div class="title-screen-actions"><p class="choice"><button type="button" class="choice-button">Start<\/button><\/p><p class="choice title-screen-load-choice"><button type="button" id="title-load" class="choice-button" disabled>Load<\/button><\/p><\/div><\/div><\/div>\s*<div id="story-visual"/);
            assert.doesNotMatch(outputHtml, /<div class="header"/);
            assert.doesNotMatch(
                outputHtml,
                /theme-switch/
            );
            assert.strictEqual(fs.readFileSync(path.join(targetDirectory, "ink.js"), "utf8"), "ink runtime");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("exports the standard reading panel by default", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-export-default-"));
        const targetDirectory = path.join(root, "web");
        const compiledJsonPath = path.join(root, "compiled.json");
        const inkRuntimePath = path.join(root, "ink.js");

        try {
            fs.writeFileSync(compiledJsonPath, JSON.stringify({ inkVersion: 21, root: ["hello"] }));
            fs.writeFileSync(inkRuntimePath, "ink runtime");
            await buildWebExport({
                compiledJsonPath,
                targetDirectory,
                templateDirectory: path.join(__dirname, "../export-for-web-template"),
                inkRuntimePath
            });

            const html = fs.readFileSync(path.join(targetDirectory, "index.html"), "utf8");
            const css = fs.readFileSync(path.join(targetDirectory, "style.css"), "utf8");
            assert.match(html, /<body data-story-format="vertical" data-presentation="traditional" data-ending-show="on" data-ending-text="The End" data-play-again-show="on" data-play-again-text="Play Again" data-audio="off" data-volume="50" data-master-volume="100" data-music-volume="100" data-sfx-volume="100" data-theme-toggle="off" data-theme-initial="light" data-theme-alternate="light">/);
            assert.match(css, /\.container \{[^}]*border-radius: var\(--frame-radius\);[^}]*box-shadow:\s*0 26px 58px -13px var\(--reader-shadow-deep/);
            assert.match(css, /\.story-passage \{[^}]*overflow-y: auto;/);
            assert.match(css, /\.container p\.choice \{[^}]*border: 0;[^}]*background: transparent;/);
            assert.doesNotMatch(html, /data-choices|##CHOICE-STYLE##/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("shows title and author only on the title screen, whichever of them exist", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-export-brand-"));
        const templateDirectory = path.join(__dirname, "../export-for-web-template");
        const compiledJsonPath = path.join(root, "compiled.json");
        const inkRuntimePath = path.join(root, "ink.js");
        const combinations = [
            { title: "Only title", author: "", hasTitle: true, hasAuthor: false },
            { title: "", author: "Only author", hasTitle: false, hasAuthor: true },
            { title: "Both", author: "Both author", hasTitle: true, hasAuthor: true },
            { title: "", author: "", hasTitle: false, hasAuthor: false }
        ];

        try {
            fs.writeFileSync(compiledJsonPath, JSON.stringify({ inkVersion: 21, root: ["hello"] }));
            fs.writeFileSync(inkRuntimePath, "ink runtime");
            for( let index = 0; index < combinations.length; index++ ) {
                const combination = combinations[index];
                const targetDirectory = path.join(root, "web-" + index);
                await buildWebExport({
                    compiledJsonPath,
                    targetDirectory,
                    templateDirectory,
                    inkRuntimePath,
                    storyTitle: combination.title,
                    storyAuthor: combination.author
                });
                const html = fs.readFileSync(path.join(targetDirectory, "index.html"), "utf8");
                const hud = html.slice(html.indexOf('<header id="controls"'), html.indexOf("</header>"));
                // The play HUD holds only the menu; the title screen alone shows title and author
                assert.doesNotMatch(hud, /story-identity/);
                assert.strictEqual(hud.includes("story-menu"), true);
                if( combination.hasTitle ) assert.strictEqual(hud.includes(combination.title), false);
                if( combination.hasAuthor ) assert.strictEqual(hud.includes(combination.author), false);
                assert.doesNotMatch(hud, /story-brand-title|story-brand-author/);
                assert.strictEqual(html.includes('class="title-screen-title"'), combination.hasTitle);
                assert.strictEqual(html.includes('class="title-screen-author"'), combination.hasAuthor);
                assert.strictEqual(html.includes('class="choice-button">Start</button>'), true);
                assert.strictEqual(html.includes("has-cover"), false);
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("always exports the vertical 9:16 frame", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-export-format-"));
        const targetDirectory = path.join(root, "web");
        const compiledJsonPath = path.join(root, "compiled.json");
        const inkRuntimePath = path.join(root, "ink.js");

        try {
            fs.writeFileSync(compiledJsonPath, JSON.stringify({ inkVersion: 21, root: ["hello"] }));
            fs.writeFileSync(inkRuntimePath, "ink runtime");
            await buildWebExport({
                compiledJsonPath,
                targetDirectory,
                templateDirectory: path.join(__dirname, "../export-for-web-template"),
                inkRuntimePath
            });

            const html = fs.readFileSync(path.join(targetDirectory, "index.html"), "utf8");
            const css = fs.readFileSync(path.join(targetDirectory, "style.css"), "utf8");
            assert.match(html, /data-story-format="vertical"/);
            assert.doesNotMatch(html, /data-story-orientation/);
            assert.doesNotMatch(html, /style="--story-aspect-ratio/);
            assert.match(css, /body\[data-story-format="vertical"\] \{ --story-aspect-ratio: 9 \/ 16; --story-aspect-ratio-number: 0\.5625; \}/);
            assert.match(css, /body\[data-story-format="vertical"\] \.container \{ width: min\(calc\(100cqw - 2 \* var\(--frame-gap, 24px\)\), var\(--width, 42rem\), calc\(\(100cqh - 2 \* var\(--frame-gap, 24px\)\) \* var\(--story-aspect-ratio-number, 1\)\)\); aspect-ratio: var\(--story-aspect-ratio, 1 \/ 1\);/);
            assert.match(css, /body\[data-story-format="vertical"\] \.outerContainer \{[^}]*container-type: size;[^}]*env\(safe-area-inset-bottom\)/);
            assert.doesNotMatch(css, /100dvh - 58px|100dvh - 54px/);
            assert.match(css, /\.container::after \{[^}]*position: absolute;[^}]*z-index: 1;[^}]*inset: auto 0 0;[^}]*height: 2\.4em;[^}]*background: linear-gradient\(to bottom, transparent, var\(--bg, #ffffff\)\);[^}]*opacity: 0;[^}]*pointer-events: none;/);
            assert.match(css, /\.container\.has-more-below::after \{\s+opacity: 0\.85;\s+\}/);
            assert.match(css, /\.container:not\(\.has-visual\) \.story-passage \{[^}]*justify-content: flex-start;/);
            assert.match(css, /\.story-passage \{[^}]*mask-image: linear-gradient\(to bottom, transparent 0, transparent var\(--story-top-cover, 0px\), #000 var\(--story-top-cover, 0px\)\);/);
            assert.match(css, /\.story-passage::after \{[^}]*height: var\(--story-scroll-fill, 0px\);/);
            assert.match(fs.readFileSync(path.join(targetDirectory, "main.js"), "utf8"), /classList\.toggle\("has-more-below"/);
            assert.doesNotMatch(css, /data-story-orientation|data-story-format="auto"|data-story-format="landscape"|data-story-format="square"|data-story-format="custom"/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("exports a selected SVG favicon at the bundle root", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-favicon-"));
        const targetDirectory = path.join(root, "web");
        const compiledJsonPath = path.join(root, "compiled.json");
        const inkRuntimePath = path.join(root, "ink.js");
        const faviconFilePath = path.join(root, "custom.svg");
        const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><circle r=".5"/></svg>';

        try {
            fs.writeFileSync(compiledJsonPath, JSON.stringify({ inkVersion: 21, root: ["hello"] }));
            fs.writeFileSync(inkRuntimePath, "ink runtime");
            fs.writeFileSync(faviconFilePath, favicon);
            const result = await buildWebExport({
                compiledJsonPath,
                targetDirectory,
                templateDirectory: path.join(__dirname, "../export-for-web-template"),
                inkRuntimePath,
                faviconFilePath
            });

            assert.ok(result.files.includes("favicon.svg"));
            assert.ok(!result.files.includes("favicon.ico"));
            assert.strictEqual(fs.readFileSync(path.join(targetDirectory, "favicon.svg"), "utf8"), favicon);
            const html = fs.readFileSync(path.join(targetDirectory, "index.html"), "utf8");
            assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("uses a favicon stored in the project root automatically", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-project-favicon-"));
        const projectDirectory = path.join(root, "project");
        const targetDirectory = path.join(root, "web");
        const compiledJsonPath = path.join(root, "compiled.json");
        const inkRuntimePath = path.join(root, "ink.js");
        const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';

        try {
            fs.mkdirSync(projectDirectory);
            fs.writeFileSync(compiledJsonPath, JSON.stringify({ inkVersion: 21, root: ["hello"] }));
            fs.writeFileSync(inkRuntimePath, "ink runtime");
            fs.writeFileSync(path.join(projectDirectory, "favicon.svg"), favicon);
            const result = await buildWebExport({
                compiledJsonPath,
                targetDirectory,
                templateDirectory: path.join(__dirname, "../export-for-web-template"),
                inkRuntimePath,
                projectDirectory
            });

            assert.ok(result.files.includes("favicon.svg"));
            assert.strictEqual(fs.readFileSync(path.join(targetDirectory, "favicon.svg"), "utf8"), favicon);
            const html = fs.readFileSync(path.join(targetDirectory, "index.html"), "utf8");
            assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("exports project audio and neutralizes paths outside the project", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-audio-paths-"));
        const projectDirectory = path.join(root, "project");
        const targetDirectory = path.join(root, "web");
        const compiledJsonPath = path.join(root, "compiled.json");
        const inkRuntimePath = path.join(root, "ink.js");
        const absoluteAudioPath = path.join(root, "absolute.mp3");
        const story = {
            inkVersion: 21,
            root: [["#", "^music: custom/loop.mp3", "/#", "#", "^sound: " + absoluteAudioPath, "/#"]]
        };

        try {
            fs.mkdirSync(path.join(projectDirectory, "custom"), { recursive: true });
            fs.mkdirSync(path.join(projectDirectory, "musics"), { recursive: true });
            fs.writeFileSync(path.join(projectDirectory, "custom", "loop.mp3"), "relative audio");
            fs.writeFileSync(absoluteAudioPath, "absolute audio");
            fs.writeFileSync(compiledJsonPath, JSON.stringify(story));
            fs.writeFileSync(inkRuntimePath, "ink runtime");

            const result = await buildWebExport({
                compiledJsonPath,
                targetDirectory,
                templateDirectory: path.join(__dirname, "../export-for-web-template"),
                inkRuntimePath,
                projectDirectory
            });
            const exportedStory = JSON.parse(fs.readFileSync(path.join(targetDirectory, "story.js"), "utf8").replace(/^var storyContent = |;\s*$/g, ""));
            const musicPath = exportedStory.root[0][1].slice(1).replace(/^music: /, "");
            const soundTag = exportedStory.root[0][4].slice(1);
            assert.strictEqual(musicPath, "custom/loop.mp3");
            assert.strictEqual(soundTag, "sound:");
            assert.strictEqual(fs.readFileSync(path.join(targetDirectory, "audio", musicPath), "utf8"), "relative audio");
            assert.ok(!result.files.some(file => file.includes("absolute.mp3")));
            const exportedMain = fs.readFileSync(path.join(targetDirectory, "main.js"), "utf8");
            assert.match(exportedMain, /parts\.map\(encodeURIComponent\)/);
            assert.ok(result.audio.copied.includes("custom/loop.mp3"));
            assert.ok(result.audio.missing.includes(absoluteAudioPath));
            assert.ok(!result.audio.copied.includes(absoluteAudioPath));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it("exports audio found in the audios folder into the bundle's audio folder, whichever way it is named", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-audios-"));
        const projectDirectory = path.join(root, "project");
        const targetDirectory = path.join(root, "web");
        const compiledJsonPath = path.join(root, "compiled.json");
        const inkRuntimePath = path.join(root, "ink.js");
        const story = { inkVersion: 21, root: [["#", "^music: dark.mp3", "/#", "#", "^sound: audios/fire.mp3", "/#"]] };

        try {
            fs.mkdirSync(path.join(projectDirectory, "audios"), { recursive: true });
            fs.writeFileSync(path.join(projectDirectory, "audios", "dark.mp3"), "dark");
            fs.writeFileSync(path.join(projectDirectory, "audios", "fire.mp3"), "fire");
            fs.writeFileSync(compiledJsonPath, JSON.stringify(story));
            fs.writeFileSync(inkRuntimePath, "ink runtime");

            const result = await buildWebExport({
                compiledJsonPath,
                targetDirectory,
                templateDirectory: path.join(__dirname, "../export-for-web-template"),
                inkRuntimePath,
                projectDirectory
            });
            assert.deepStrictEqual(result.audio.missing, []);
            const exportedStory = JSON.parse(fs.readFileSync(path.join(targetDirectory, "story.js"), "utf8").replace(/^var storyContent = |;\s*$/g, ""));
            assert.strictEqual(exportedStory.root[0][1], "^music: dark.mp3");
            assert.strictEqual(exportedStory.root[0][4], "^sound: fire.mp3", "the audios/ prefix is not carried into the bundle");
            assert.strictEqual(fs.readFileSync(path.join(targetDirectory, "audio", "dark.mp3"), "utf8"), "dark");
            assert.strictEqual(fs.readFileSync(path.join(targetDirectory, "audio", "fire.mp3"), "utf8"), "fire");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
