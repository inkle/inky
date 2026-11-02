const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JSDOM } = require("jsdom");
const { GameStyle } = require("../renderer/gameStyle.js");
const { TitleScreen } = require("../renderer/titleScreen.js");
const { buildWebExport } = require("../renderer/webExporter.js");

function withPlayerView(html, run) {
    const dom = new JSDOM(html);
    const previous = { window: global.window, document: global.document, DOMParser: global.DOMParser, NodeFilter: global.NodeFilter };
    const playerViewPath = require.resolve("../renderer/playerView.js");
    const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");
    global.window = dom.window;
    global.document = dom.window.document;
    global.DOMParser = dom.window.DOMParser;
    global.NodeFilter = dom.window.NodeFilter;
    delete require.cache[jqueryPath];
    delete require.cache[playerViewPath];
    try {
        return run(require("../renderer/playerView.js").PlayerView, dom.window);
    } finally {
        delete require.cache[playerViewPath];
        delete require.cache[jqueryPath];
        Object.keys(previous).forEach(key => {
            if( previous[key] === undefined ) delete global[key];
            else global[key] = previous[key];
        });
        dom.window.close();
    }
}

const PLAYER = '<div id="player" data-story-title="O Farol" data-story-author="Clara Santos">' +
    '<div class="scrollContainer"><div class="innerText active"></div>' +
    '<div class="hiddenBuffer"><div class="innerText"></div></div></div></div>';

describe("title screen", function () {
    describe("markup", function () {
        it("shows only what exists and never invents text", function () {
            const html = data => TitleScreen.html(data);
            assert.match(html({ title: "T", author: "A" }), /<h1 class="title-screen-title">T<\/h1><div class="title-screen-author">by A<\/div>/);
            const onlyTitle = html({ title: "T" });
            assert.match(onlyTitle, /title-screen-title/);
            assert.doesNotMatch(onlyTitle, /title-screen-author|por /);
            const onlyAuthor = html({ author: "A" });
            assert.doesNotMatch(onlyAuthor, /title-screen-title/);
            assert.match(onlyAuthor, /by A/);
            const nothing = html({});
            assert.doesNotMatch(nothing, /title-screen-title|title-screen-author|title-screen-cover|has-cover/);
            [onlyTitle, onlyAuthor, nothing].forEach(markup =>
                assert.match(markup, /<p class="choice"><button type="button" class="choice-button">Start<\/button><\/p>/));
            assert.doesNotMatch(html({ title: "  ", author: "  " }), /title-screen-title|title-screen-author/);
        });

        it("adds the cover as a picture and escapes everything the writer typed", function () {
            const markup = TitleScreen.html({ title: '<b onclick="x">T</b>', author: "A & B", coverSrc: 'cover".png' });
            assert.match(markup, /class="title-screen has-cover"/);
            assert.match(markup, /<img class="title-screen-cover" src="cover&quot;\.png" alt="">/);
            assert.doesNotMatch(markup, /<b /);
            assert.match(markup, /by A &amp; B/);
        });
    });

    describe("cover setting in game.yaml", function () {
        it("is read, kept in the model and written back, with one source of truth", function () {
            const parsed = GameStyle.parseText('titles:\n  story: "O Farol"\n  cover: images\\cover.JPG\n');
            assert.deepStrictEqual(parsed.warnings, []);
            assert.strictEqual(parsed.model.titles.cover, "images/cover.JPG");
            assert.strictEqual(parsed.style.titles.cover, "images/cover.JPG");
            const yaml = GameStyle.toYaml(parsed.model);
            assert.match(yaml, /titles:\n {2}story: "O Farol"\n {2}cover: "images\/cover\.JPG"/);
            assert.strictEqual(GameStyle.parseText(yaml).model.titles.cover, "images/cover.JPG");
            const onlyCover = GameStyle.toYaml(GameStyle.parseText('titles:\n  cover: "a.png"\n').model);
            assert.match(onlyCover, /titles:\n {2}cover: "a\.png"/);
            assert.doesNotMatch(GameStyle.toYaml(GameStyle.parseText("theme: light\n").model), /cover/);
        });

        it("warns about, and ignores, a cover that is not a picture inside the project", function () {
            ["/etc/passwd.png", "C:/x/cover.png", "../cover.png", "images/../../c.png", "https://x.test/c.png", "cover.txt", "cover", 5, ""]
                .forEach(value => {
                    const parsed = GameStyle.parseText("titles:\n  cover: " + JSON.stringify(value) + "\n");
                    assert.strictEqual(parsed.model.titles.cover, "", String(value));
                    assert.strictEqual(parsed.warnings.length, 1, String(value));
                    assert.match(parsed.warnings[0], /titles\.cover/);
                    assert.doesNotMatch(GameStyle.toYaml(parsed.model), /cover/);
                });
            assert.deepStrictEqual(GameStyle.parseText("titles:\n  cover: null\n").warnings, []);
        });

        it("finds the file only inside the project folder", function () {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-cover-"));
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), "inky-cover-outside-"));
            try {
                fs.mkdirSync(path.join(root, "images"));
                fs.writeFileSync(path.join(root, "images", "cover.png"), "png");
                fs.writeFileSync(path.join(outside, "secret.png"), "png");
                fs.symlinkSync(outside, path.join(root, "link"));
                assert.strictEqual(GameStyle.resolveCoverFile(root, "images/cover.png"), path.join(root, "images", "cover.png"));
                assert.strictEqual(GameStyle.resolveCoverFile(root, "images/missing.png"), null);
                assert.strictEqual(GameStyle.resolveCoverFile(root, "link/secret.png"), null);
                assert.strictEqual(GameStyle.resolveCoverFile(root, "../secret.png"), null);
                assert.strictEqual(GameStyle.resolveCoverFile(null, "images/cover.png"), null);
                assert.strictEqual(GameStyle.resolveCoverFile(root, ""), null);
                assert.strictEqual(GameStyle.coverReferenceForFile(root, path.join(root, "images", "cover.png")), "images/cover.png");
                assert.strictEqual(GameStyle.coverReferenceForFile(root, path.join(outside, "secret.png")), null);
                assert.strictEqual(GameStyle.coverReferenceForFile(root, path.join(root, "notes.txt")), null);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
                fs.rmSync(outside, { recursive: true, force: true });
            }
        });
    });

    describe("Preview", function () {
        it("covers the visible frame until the story starts, and follows the frame when buffers swap", function () {
            const dom = new JSDOM(PLAYER);
            const player = dom.window.document.getElementById("player");
            assert.strictEqual(TitleScreen.isPending(player), true);
            TitleScreen.sync(player);
            const active = () => player.querySelector(".innerText.active");
            assert.strictEqual(active().firstElementChild.id, "title-screen");
            assert.strictEqual(active().classList.contains("title-screen-active"), true);
            assert.strictEqual(player.querySelectorAll(".title-screen").length, 1);
            assert.match(active().querySelector(".title-screen-title").textContent, /O Farol/);

            // the Preview swaps buffers after a recompile: the screen moves to the new visible frame
            const hidden = player.querySelector(".hiddenBuffer .innerText");
            active().classList.remove("active");
            hidden.classList.add("active");
            TitleScreen.sync(player);
            assert.strictEqual(player.querySelectorAll(".title-screen").length, 1);
            assert.strictEqual(hidden.firstElementChild.id, "title-screen");
            assert.strictEqual(player.querySelectorAll(".title-screen-active").length, 1);

            // new title, author and cover (a style change) rebuild it
            player.dataset.storyTitle = "Outro";
            player.dataset.storyCover = "file:///tmp/c.png";
            TitleScreen.sync(player);
            assert.match(hidden.querySelector(".title-screen-title").textContent, /Outro/);
            assert.strictEqual(hidden.querySelector("img.title-screen-cover").getAttribute("src"), "file:///tmp/c.png");
            assert.strictEqual(player.querySelectorAll(".title-screen").length, 1);

            TitleScreen.start(player);
            assert.strictEqual(TitleScreen.isPending(player), false);
            assert.strictEqual(player.querySelectorAll(".title-screen, .title-screen-active").length, 0);
            TitleScreen.sync(player);
            assert.strictEqual(player.querySelectorAll(".title-screen").length, 0);
            dom.window.close();
        });

        it("takes title, author and cover from game.yaml and keeps them out of the story text", function () {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-cover-preview-"));
            const dom = new JSDOM(PLAYER);
            const previousDocument = global.document;
            global.document = dom.window.document;
            try {
                fs.writeFileSync(path.join(root, "cover.png"), "png");
                const project = { mainInk: { projectDir: root } };
                GameStyle.applyToPreview(GameStyle.parseText('titles:\n  story: "T"\n  author: "A"\n  cover: "cover.png"\n').style, project);
                const frame = dom.window.document.querySelector(".innerText.active");
                assert.strictEqual(frame.querySelector(".title-screen-title").textContent, "T");
                assert.strictEqual(frame.querySelector(".title-screen-author").textContent, "by A");
                assert.match(frame.querySelector("img.title-screen-cover").getAttribute("src"), /^file:\/\/.*\/cover\.png$/);
                assert.strictEqual(frame.querySelector(".storyTitle, .storyAuthor"), null);

                // a missing cover is simply left out, the rest still shows
                GameStyle.applyToPreview(GameStyle.parseText('titles:\n  story: "T"\n  cover: "gone.png"\n').style, project);
                assert.strictEqual(dom.window.document.querySelector(".title-screen-cover"), null);
                assert.strictEqual(dom.window.document.querySelector(".title-screen-title").textContent, "T");
                assert.strictEqual(dom.window.document.querySelector(".has-cover"), null);
            } finally {
                global.document = previousDocument;
                dom.window.close();
                fs.rmSync(root, { recursive: true, force: true });
            }
        });

        it("starts the story only from the Start choice, once, and tells the controller", function () {
            withPlayerView(PLAYER, (playerView, window) => {
                const events = [];
                playerView.setEvents({ storyStarted: () => events.push("started") });
                const { TitleScreen: Screen } = require("../renderer/titleScreen.js");
                const player = window.document.getElementById("player");
                Screen.sync(player);
                assert.strictEqual(playerView.isTitleScreenPending(), true);

                // text that arrives under the title screen stays in the story, hidden
                playerView.setAnimationEnabled(false);
                playerView.addTextSection("Primeiro trecho");
                playerView.addTags(["title: Uma cena"]);
                assert.strictEqual(window.document.querySelectorAll(".title-screen").length, 1);
                assert.strictEqual(events.length, 0);

                window.document.querySelector(".title-screen .choice-button").click();
                assert.deepStrictEqual(events, ["started"]);
                assert.strictEqual(playerView.isTitleScreenPending(), false);
                assert.strictEqual(window.document.querySelectorAll(".title-screen").length, 0);
                assert.strictEqual(window.document.querySelector(".innerText.active").textContent.includes("Primeiro trecho"), true);
            });
        });

        it("brings the title screen back when the story is reset", function () {
            withPlayerView(PLAYER, (playerView, window) => {
                const events = [];
                playerView.setEvents({ storyStarted: () => events.push("started") });
                const { TitleScreen: Screen } = require("../renderer/titleScreen.js");
                const player = window.document.getElementById("player");
                Screen.sync(player);
                window.document.querySelector(".title-screen .choice-button").click();
                assert.strictEqual(playerView.isTitleScreenPending(), false);
                assert.strictEqual(window.document.querySelectorAll(".title-screen").length, 0);

                // the reset button puts the title screen back over the story that is on screen
                playerView.setAnimationEnabled(false);
                playerView.addTextSection("Segundo trecho");
                player.dataset.storyCover = "file:///tmp/c.png";
                playerView.resetTitleScreen();
                assert.strictEqual(playerView.isTitleScreenPending(), true);
                const screen = window.document.querySelector(".innerText.active .title-screen");
                assert.ok(screen);
                assert.match(screen.querySelector(".title-screen-title").textContent, /O Farol/);
                assert.match(screen.querySelector(".title-screen-author").textContent, /by Clara Santos/);
                assert.strictEqual(screen.querySelector("img.title-screen-cover").getAttribute("src"), "file:///tmp/c.png");
                assert.strictEqual(events.length, 1, "resetting does not start the story by itself");

                // the re-armed screen follows the frame when the replay swaps the buffers
                const active = player.querySelector(".innerText.active");
                const hidden = player.querySelector(".hiddenBuffer .innerText");
                active.classList.remove("active");
                hidden.classList.add("active");
                Screen.sync(player);
                assert.strictEqual(player.querySelectorAll(".title-screen").length, 1);
                assert.strictEqual(hidden.firstElementChild.id, "title-screen");

                // Start starts the story again, once
                window.document.querySelector(".title-screen .choice-button").click();
                assert.deepStrictEqual(events, ["started", "started"]);
                assert.strictEqual(playerView.isTitleScreenPending(), false);
                assert.strictEqual(window.document.querySelectorAll(".title-screen").length, 0);
            });
        });
    });

    describe("web export", function () {
        const templateDirectory = path.join(__dirname, "../export-for-web-template");

        async function exportWith(extra, check) {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-title-export-"));
            try {
                fs.writeFileSync(path.join(root, "compiled.json"), JSON.stringify({ inkVersion: 21, root: ["hello"] }));
                fs.writeFileSync(path.join(root, "ink.js"), "ink runtime");
                const targetDirectory = path.join(root, "web");
                const result = await buildWebExport(Object.assign({
                    compiledJsonPath: path.join(root, "compiled.json"),
                    targetDirectory,
                    templateDirectory,
                    inkRuntimePath: path.join(root, "ink.js"),
                    storyTitle: "O Farol",
                    storyAuthor: "Clara Santos"
                }, extra(root)));
                return await check(targetDirectory, result, root);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }

        it("copies the cover next to the page and uses it on the title screen", async function () {
            await exportWith(root => {
                fs.writeFileSync(path.join(root, "mine.JPG"), "jpg-bytes");
                return { coverFilePath: path.join(root, "mine.JPG") };
            }, (target, result) => {
                assert.strictEqual(fs.readFileSync(path.join(target, "cover.jpg"), "utf8"), "jpg-bytes");
                assert.ok(result.files.includes("cover.jpg"));
                const html = fs.readFileSync(path.join(target, "index.html"), "utf8");
                assert.match(html, /<div class="title-screen has-cover" id="title-screen"><img class="title-screen-cover" src="cover\.jpg" alt="">/);
            });
        });

        it("carries every cover format as a picture, cropped to the chosen frame", async function () {
            for( const filename of ["capa.jpg", "capa.jpeg", "capa.png", "capa.webp", "capa.gif", "capa.svg"] ) {
                const extension = path.extname(filename);
                await exportWith(root => {
                    fs.writeFileSync(path.join(root, filename), filename + "-bytes");
                    return { coverFilePath: path.join(root, filename) };
                }, (target, result) => {
                    const exportedCover = "cover" + extension;
                    assert.strictEqual(fs.readFileSync(path.join(target, exportedCover), "utf8"), filename + "-bytes", exportedCover);
                    assert.ok(result.files.includes(exportedCover), exportedCover);
                    const html = fs.readFileSync(path.join(target, "index.html"), "utf8");
                    const screen = html.match(/<div class="title-screen has-cover"[\s\S]*?<\/div><\/div>/)[0];
                    assert.ok(screen.includes(`<img class="title-screen-cover" src="${exportedCover}" alt="">`), screen);
                    // a cover is always a picture: an SVG's own script never reaches the page
                    assert.doesNotMatch(screen, /<svg|<script|\bonload=/i, "the SVG cover is not embedded in the DOM");
                });
            }
        });

        it("fills the 9:16 frame with the cover, without stretching", async function () {
            await exportWith(root => {
                fs.writeFileSync(path.join(root, "capa.png"), "png");
                return { coverFilePath: path.join(root, "capa.png") };
            }, target => {
                const css = fs.readFileSync(path.join(target, "style.css"), "utf8");
                assert.match(css, /\.title-screen \{[^}]*position: absolute;[^}]*inset: 0;/, "the cover box is the whole frame");
                assert.match(css, /\.title-screen-cover \{[^}]*object-fit: cover;/, "the picture is cropped, never stretched");
                assert.ok(css.includes('body[data-story-format="vertical"] .container'), "the frame keeps the vertical proportion");
            });
        });

        it("rejects a cover that is missing or not a picture, and exports none when none is given", async function () {            await assert.rejects(exportWith(root => ({ coverFilePath: path.join(root, "gone.png") }), () => {}), /cover image could not be found/);
            await assert.rejects(exportWith(root => {
                fs.writeFileSync(path.join(root, "notes.txt"), "x");
                return { coverFilePath: path.join(root, "notes.txt") };
            }, () => {}), /Unsupported cover image format/);
            await exportWith(() => ({}), (target, result) => {
                assert.strictEqual(fs.existsSync(path.join(target, "cover.jpg")), false);
                assert.ok(!result.files.some(file => file.startsWith("cover.")));
                assert.doesNotMatch(fs.readFileSync(path.join(target, "index.html"), "utf8"), /title-screen-cover/);
            });
        });

        it("ships the same title screen stylesheet as the Preview, scoped to the frame", async function () {
            await exportWith(() => ({}), target => {
                const css = fs.readFileSync(path.join(target, "style.css"), "utf8");
                const shared = fs.readFileSync(path.join(__dirname, "../renderer/titleScreen.css"), "utf8");
                assert.ok(css.includes(shared), "the exported style.css contains titleScreen.css unchanged");
                assert.match(css, /\.container \{ position: relative; \}/);
                assert.doesNotMatch(css, /body\[data-story-format="auto"\]/);
            });
        });
    });

    describe("exported page script", function () {
        const template = fs.readFileSync(path.join(__dirname, "../export-for-web-template/main.js"), "utf8");

        function openPage(options = {}) {
            const dom = new JSDOM(
                '<header id="controls"><button id="rewind"></button><button id="save"></button><button id="reload"></button></header>' +
                '<div class="outerContainer"><div id="story" class="container title-screen-active">' +
                TitleScreen.html({ title: "T", author: "A" }) +
                '<div id="story-passage" class="story-passage" hidden></div></div></div>',
                { url: "https://stories.example/game/index.html", runScripts: "outside-only" }
            );
            const window = dom.window;
            const log = [];
            let lines = ["Primeiro trecho."];
            const story = {
                globalTags: [],
                state: { toJson: () => "{}", LoadJson: () => log.push("load-save") },
                currentTags: ["music: tema.mp3"],
                currentChoices: [{ index: 0, text: "Seguir" }],
                get canContinue() { return lines.length > 0; },
                Continue() { log.push("continue"); return lines.shift(); },
                ChooseChoiceIndex() {},
                ResetState() { log.push("reset"); lines = ["Primeiro trecho."]; }
            };
            if( options.storage ) Object.keys(options.storage).forEach(key => window.localStorage.setItem(key, options.storage[key]));
            window.inkjs = { Story: function() { return story; } };
            window.storyContent = {};
            window.matchMedia = () => ({ matches: false });
            window.Audio = function(url) {
                log.push("audio:" + url);
                this.play = () => Promise.resolve();
                this.addEventListener = () => {};
                this.pause = this.load = this.removeAttribute = () => {};
            };
            window.eval(template);
            return { window, log, document: window.document, dom };
        }

        it("does not run the story, or play its sounds, before Start", function () {
            const page = openPage();
            const doc = page.document;
            assert.deepStrictEqual(page.log, []);
            assert.strictEqual(doc.getElementById("story-passage").hidden, true);
            assert.strictEqual(doc.getElementById("story").classList.contains("title-screen-active"), true);

            // the toolbar cannot start the story under the title screen either
            ["rewind", "save", "reload"].forEach(id => doc.getElementById(id).click());
            assert.deepStrictEqual(page.log, []);
            assert.strictEqual(doc.getElementById("story-passage").children.length, 0);

            doc.querySelector("#title-screen .choice-button").click();
            assert.deepStrictEqual(page.log.filter(entry => entry === "continue").length, 1);
            assert.strictEqual(page.log.some(entry => entry.startsWith("audio:")), true);
            assert.strictEqual(doc.getElementById("title-screen").hidden, true);
            assert.strictEqual(doc.getElementById("story-passage").hidden, false);
            assert.strictEqual(doc.getElementById("story").classList.contains("title-screen-active"), false);
            assert.match(doc.getElementById("story-passage").textContent, /Primeiro trecho/);
            page.dom.window.close();
        });

        it("starts only once, however many times Start is activated", function () {
            const page = openPage();
            const button = page.document.querySelector("#title-screen .choice-button");
            button.click();
            button.click();
            assert.strictEqual(page.log.filter(entry => entry === "continue").length, 1);
            page.dom.window.close();
        });

        it("starts from the beginning, not from the saved game, when the story is reset", function () {
            const first = openPage();
            first.document.querySelector("#title-screen .choice-button").click();
            first.document.getElementById("save").click();
            const storage = {};
            for( let i = 0; i < first.window.localStorage.length; i++ ) {
                const key = first.window.localStorage.key(i);
                storage[key] = first.window.localStorage.getItem(key);
            }
            first.dom.window.close();
            const saveKey = Object.keys(storage).find(key => !key.endsWith(":music"));
            storage[saveKey + ":music"] = "audio/old.mp3";

            const page = openPage({ storage });
            page.document.querySelector("#title-screen .choice-button").click();
            const savedMusic = () => page.log.filter(entry => entry.endsWith("old.mp3")).length;
            assert.strictEqual(page.log.includes("load-save"), true);
            assert.strictEqual(savedMusic(), 1);

            // after a reset the saved music stays out; the run starts from the story's own beginning
            page.document.getElementById("rewind").click();
            page.document.querySelector("#title-screen .choice-button").click();
            assert.strictEqual(savedMusic(), 1);
            assert.strictEqual(page.log.filter(entry => entry === "continue").length, 2);
            page.dom.window.close();
        });

        it("brings the title screen back when the story is reset, and starts it again from Start", function () {
            const page = openPage();
            const doc = page.document;
            doc.querySelector("#title-screen .choice-button").click();
            const continues = () => page.log.filter(entry => entry === "continue").length;
            const sounds = () => page.log.filter(entry => entry.startsWith("audio:")).length;
            assert.strictEqual(continues(), 1);
            assert.strictEqual(sounds(), 1);
            assert.strictEqual(doc.getElementById("title-screen").hidden, true);

            // the rest of the toolbar cannot restart the story under the title screen either
            doc.getElementById("rewind").click();
            assert.strictEqual(page.log.includes("reset"), true);
            assert.strictEqual(doc.getElementById("title-screen").hidden, false);
            assert.strictEqual(doc.getElementById("story").classList.contains("title-screen-active"), true);
            assert.strictEqual(doc.getElementById("story-passage").hidden, true);
            assert.strictEqual(doc.getElementById("story-passage").textContent.includes("Primeiro trecho"), false);
            assert.match(doc.getElementById("title-screen").textContent, /T/);
            assert.match(doc.getElementById("title-screen").textContent, /by A/);
            ["save", "reload", "rewind"].forEach(id => doc.getElementById(id).click());
            assert.strictEqual(continues(), 1);
            assert.strictEqual(sounds(), 1);
            assert.strictEqual(page.log.filter(entry => entry === "reset").length, 1);

            // Start runs the story from its beginning again, once, and only then its sounds
            doc.querySelector("#title-screen .choice-button").click();
            assert.strictEqual(doc.getElementById("title-screen").hidden, true);
            assert.strictEqual(doc.getElementById("story").classList.contains("title-screen-active"), false);
            assert.strictEqual(doc.getElementById("story-passage").hidden, false);
            assert.strictEqual(continues(), 2);
            assert.strictEqual(sounds(), 2);
            assert.match(doc.getElementById("story-passage").textContent, /Primeiro trecho/);
            page.dom.window.close();
        });
    });
});

describe("title screen layout", function () {
    it("keeps the title, author and Start near the footer with or without a cover", function () {
        const css = require("fs").readFileSync(require("path").join(__dirname, "../renderer/titleScreen.css"), "utf8");
        const body = css.match(/\.title-screen-body \{[^}]*\}/)[0];
        assert.match(body, /justify-content: flex-end/);
        assert.match(body, /padding: 9cqmin 8cqmin 13cqmin/);
        assert.doesNotMatch(css, /has-cover \.title-screen-body/);
    });
});
