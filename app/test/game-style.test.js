const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { GameStyle } = require("../renderer/gameStyle.js");

describe("game style title settings", function () {
    it("defaults to the standard reading panel", function () {
        const parsed = GameStyle.parseText("theme: light\n");

        assert.strictEqual(parsed.model.layout.lineHeight, 1.7);
        assert.strictEqual(parsed.model.layout.choiceStyle, undefined);
        assert.strictEqual(parsed.model.layout.storyFormat, undefined);
        assert.strictEqual(parsed.model.layout.customAspectRatio, undefined);
        assert.strictEqual(parsed.style.layout.choiceStyle, undefined);
        assert.doesNotMatch(GameStyle.templateYaml(), /choice_style/);
        assert.doesNotMatch(GameStyle.toYaml(parsed.model), /choice_style/);
        assert.strictEqual(parsed.style.layout.storyAspectRatio, undefined);
        assert.match(GameStyle.templateYaml(), /line_height: 1\.7/);
        assert.match(GameStyle.exportCss(parsed.style), /--line-height: 1\.7;/);

        const saved = GameStyle.parseText(GameStyle.toYaml(parsed.model));
        assert.strictEqual(saved.model.layout.storyFormat, undefined);
        assert.strictEqual(saved.model.layout.lineHeight, 1.7);
    });

    it("ignores the retired choice_style key in existing YAML without warnings or re-serializing it", function () {
        const parsed = GameStyle.parseText("layout:\n  choice_style: buttons\n  line_height: 1.9\n");
        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.model.layout.lineHeight, 1.9);
        assert.strictEqual(parsed.model.layout.choiceStyle, undefined);
        assert.doesNotMatch(GameStyle.toYaml(parsed.model), /choice_style/);
    });

    it("accepts the retired container key in existing YAML without re-serializing it", function () {
        const parsed = GameStyle.parseText("layout:\n  container: classic\n");
        assert.deepStrictEqual(parsed.warnings, []);
        assert.doesNotMatch(GameStyle.toYaml(parsed.model), /container:/);
    });

    it("ignores the retired story display format keys and always uses 9:16", function () {
        const parsed = GameStyle.parseText([
            "layout:",
            "  story_format: landscape",
            '  custom_aspect_ratio: "4:5"',
            ""
        ].join("\n"));

        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.model.layout.storyFormat, undefined);
        assert.strictEqual(parsed.model.layout.customAspectRatio, undefined);
        assert.doesNotMatch(GameStyle.toYaml(parsed.model), /story_format|custom_aspect_ratio/);
        assert.strictEqual(parsed.style.layout.storyAspectRatio, undefined);
    });

    it("keeps a user-selected line height when reading and serializing Advanced YAML", function () {
        const parsed = GameStyle.parseText("layout:\n  line_height: 1.45\n");

        assert.strictEqual(parsed.model.layout.lineHeight, 1.45);
        assert.strictEqual(GameStyle.parseText(GameStyle.toYaml(parsed.model)).model.layout.lineHeight, 1.45);
    });

    it("keeps existing projects on their previous scene title styling defaults", function () {
        const parsed = GameStyle.parseText("theme: light\n");

        assert.strictEqual(parsed.model.titles.story, "");
        assert.strictEqual(parsed.model.titles.author, "");
        assert.strictEqual(parsed.model.titles.storyStyle, undefined);
        assert.strictEqual(parsed.model.titles.authorStyle, undefined);
        assert.strictEqual(parsed.model.titles.sceneStyle.configured, false);
        assert.doesNotMatch(GameStyle.exportCss(parsed.style), /\.header h1|\.header \.byline/);
        assert.doesNotMatch(GameStyle.exportCss(parsed.style), /\.container \.scene-title\s*\{/);
    });

    it("round-trips story title text and scene title styling, dropping retired title styles", function () {
        const parsed = GameStyle.parseText([
            "titles:",
            '  story: "A Custom Story"',
            '  author: "A. Writer"',
            "  story_style:",
            "    family: serif",
            "    size: 48",
            '    color: "#aa3300"',
            "    align: left",
            "  author_style:",
            "    family: mono",
            "    size: 18",
            '    color: "#008800"',
            "    align: right",
            "  scene_style:",
            "    family: mono",
            "    size: 26",
            '    color: "#0033aa"',
            "    align: right",
            ""
        ].join("\n"));

        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.model.titles.story, "A Custom Story");
        assert.strictEqual(parsed.model.titles.author, "A. Writer");
        assert.strictEqual(parsed.model.titles.storyStyle, undefined);
        assert.strictEqual(parsed.model.titles.authorStyle, undefined);
        assert.strictEqual(parsed.model.titles.sceneStyle.size, 26);
        assert.strictEqual(parsed.model.titles.sceneStyle.color, "#0033aa");

        const yaml = GameStyle.toYaml(parsed.model);
        assert.doesNotMatch(yaml, /story_style|author_style/);
        assert.match(yaml, /scene_style:/);

        const saved = GameStyle.parseText(yaml);
        assert.strictEqual(saved.model.titles.story, "A Custom Story");
        assert.strictEqual(saved.model.titles.author, "A. Writer");
        assert.deepStrictEqual(saved.model.titles.sceneStyle, parsed.model.titles.sceneStyle);

        const css = GameStyle.exportCss(saved.style);
        assert.doesNotMatch(css, /\.header h1|\.header \.byline/);
        assert.match(css, /\.container \.scene-title\s*\{[\s\S]*font-size: 26px;[\s\S]*text-align: right;/);
    });

    it("ignores the retired story and author title styles without warnings or writing them back", function () {
        const parsed = GameStyle.parseText([
            "titles:",
            "  story_style:",
            "    size: 52",
            "    align: right",
            "  author_style:",
            "    size: 18",
            "    align: center",
            ""
        ].join("\n"));
        const css = GameStyle.exportCss(parsed.style);

        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.model.titles.storyStyle, undefined);
        assert.strictEqual(parsed.model.titles.authorStyle, undefined);
        assert.strictEqual(parsed.model.titles.sceneStyle.configured, false);
        assert.doesNotMatch(css, /\.header h1|\.header \.byline/);
        assert.doesNotMatch(css, /\.container \.scene-title\s*\{/);
        assert.doesNotMatch(GameStyle.toYaml(parsed.model), /story_style|author_style/);
    });

    it("makes the scene title follow the text by default and lets an explicit alignment win", function () {
        const auto = GameStyle.parseText("titles:\n  scene_style:\n    size: 24\n");
        assert.strictEqual(auto.model.titles.sceneStyle.align, "auto");
        assert.doesNotMatch(GameStyle.exportCss(auto.style), /text-align/);
        assert.strictEqual(
            GameStyle.parseText(GameStyle.toYaml(auto.model)).model.titles.sceneStyle.align,
            "auto"
        );

        const explicit = GameStyle.parseText("titles:\n  scene_style:\n    align: right\n");
        assert.match(GameStyle.exportCss(explicit.style), /\.container \.scene-title\s*\{[\s\S]*text-align: right;/);
    });

    it("builds the title screen from the GUI title and author, not from the story text", function () {
        const dom = new JSDOM(
            '<div id="player"><div class="innerText active"></div><div class="hiddenBuffer"><div class="innerText"></div></div></div>'
        );
        const previousDocument = global.document;
        global.document = dom.window.document;
        try {
            const style = GameStyle.resolve({
                titles: {
                    author: "GUI Author"
                }
            }).style;
            const project = {
                mainInk: {
                    symbols: {
                        globalTags: ["title: Ink title", "author: Ink author"],
                        globalDictionaryStyleTags: { title: "Ink title" }
                    }
                }
            };
            GameStyle.applyToPreview(style, project);

            const player = dom.window.document.getElementById("player");
            const buffer = player.querySelector(".innerText");
            assert.strictEqual(buffer.querySelector(".storyTitle"), null);
            assert.strictEqual(buffer.querySelector(".storyAuthor"), null);
            assert.strictEqual(buffer.querySelector(".title-screen-title"), null);
            assert.strictEqual(buffer.querySelector(".title-screen-author").textContent, "Written by GUI Author");
            assert.strictEqual(buffer.firstElementChild.id, "controls");
            assert.ok(buffer.querySelector(".title-screen"));
            assert.strictEqual(player.classList.contains("game-preview-panel"), true);
            assert.strictEqual(player.style.getPropertyValue("--game-story-aspect-ratio"), "9 / 16");
            assert.strictEqual(player.style.getPropertyValue("--game-story-aspect-ratio-number"), String(9 / 16));
            assert.strictEqual(
                JSON.parse(player.dataset.globalTags).join(","),
                "title: Ink title,author: Ink author"
            );
        } finally {
            if( previousDocument === undefined ) delete global.document;
            else global.document = previousDocument;
            dom.window.close();
        }
    });

    it("styles the IDE preview as a centered page with separated narrative and choice blocks", function () {
        const css = fs.readFileSync(path.join(__dirname, "../renderer/main.css"), "utf8");
        const chrome = fs.readFileSync(path.join(__dirname, "../renderer/gameChrome.css"), "utf8");
        const html = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
        const settings = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.html"), "utf8");

        // The frame, its page, the passage and the menu are shared with the exported page.
        assert.match(chrome, /#main #player \.scrollContainer \{[^}]*display: grid;[^}]*place-items: center;[^}]*overflow: hidden;[^}]*container-type: size;/);
        assert.match(chrome, /#main #player \.innerText\.container \{[^}]*display: flex;[^}]*border-radius: var\(--frame-radius\);[^}]*box-shadow:\s*0 26px 58px -13px var\(--reader-shadow-deep/);
        assert.match(chrome, /#main #player \.story-hud \{[^}]*position: absolute;[^}]*inset: 0 0 auto;/);
        assert.match(chrome, /#main #player #story-menu > button \{[^}]*display: flex;/);
        assert.match(chrome, /#main #player \.story-passage \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none;[^}]*justify-content: safe center;/);
        assert.match(chrome, /#main #player \.innerText:not\(\.has-visual\) \.story-passage \{[^}]*justify-content: flex-start;/);
        assert.match(chrome, /#main #player \.story-passage \{[^}]*clip-path: inset\(var\(--story-top-cover, 0px\) 0 0\);/);
        assert.match(chrome, /#main #player \.story-passage::after \{[^}]*height: var\(--story-scroll-fill, 0px\);/);
        assert.match(chrome, /#main #player \.innerText\.container::after \{[^}]*position: absolute;[^}]*background: linear-gradient\(to bottom, transparent, var\(--game-bg, #ffffff\)\);[^}]*opacity: 0;[^}]*pointer-events: none;/);
        assert.match(chrome, /#main #player \.innerText\.container\.has-background \{[^}]*background-size: cover;[^}]*background-repeat: no-repeat;/);
        assert.match(chrome, /#main #player \.innerText\.container\.has-background \.story-visual \{\s*background: transparent;/);
        assert.match(chrome, /#main #player \.innerText\.container\.has-background \.story-choices \{\s*background: transparent;/);
        const exportedChrome = fs.readFileSync(path.join(__dirname, "../export-for-web-template/style.css"), "utf8");
        assert.match(exportedChrome, /\.container\.has-background \{[^}]*background-size: cover;[^}]*background-repeat: no-repeat;/);
        assert.match(exportedChrome, /\.container\.has-background \.story-visual \{\s*background: transparent;/);
        assert.match(exportedChrome, /\.container\.has-background \.story-choices \{\s*background: transparent;/);
        assert.match(chrome, /#main #player \.innerText\.container\.has-more-below::after \{\s*opacity: 0\.85;/);
        assert.match(chrome, /#main #player\[data-story-format="vertical"\] \.innerText\.container \{/);
        assert.match(css, /#main #player p\.storyText \{[^}]*margin: 0;[^}]*line-height: var\(--game-line-height/);
        assert.match(css, /#main #player \.innerText \.sceneTitle \{[^}]*padding: 0;[^}]*font-family: var\(--game-scene-title-family, Georgia/);
        assert.doesNotMatch(css, /\.storyTitle|\.storyAuthor/);
        assert.match(css, /#main #player \.innerText\.title-screen-active \{\s*overflow: hidden;/);
        assert.match(chrome, /#main #player \.innerText\.container\.title-screen-active > :not\(\.title-screen\) \{\s*display: none;/);
        assert.match(html, /<link rel="stylesheet" href="gameChrome\.css">/);
        assert.match(html, /<link rel="stylesheet" href="titleScreen\.css">/);
        assert.match(css, /#main #player p\.choice \{[^}]*margin: 0;[^}]*border-bottom: 1px solid color-mix\(in srgb, var\(--game-text, #000000\) 14%[^}]*line-height:/);
        assert.match(css, /#main #player p\.choice \.choice-button \{[^}]*display: block;[^}]*min-height: 44px;[^}]*border: 0;[^}]*color: var\(--game-choice/);
        assert.match(css, /#main #player p\.choice \.choice-button::after \{[^}]*border-right: 2px solid currentColor;/);
        assert.match(css, /#main #player p\.choice \.choice-button:hover,\s*#main #player p\.choice \.choice-button:focus-visible,[^{]*\{[^}]*box-shadow: inset 3px 0 0 var\(--game-choice-hover[^}]*\}/);
        assert.doesNotMatch(css, /game-choices-buttons/);
        assert.match(html, /href="main\.css\?v=0\.15\.2-44-preview-parity"/);
        assert.doesNotMatch(settings, /<h2>Layout<\/h2>/);
        assert.doesNotMatch(settings, /name="container-style"/);
        assert.doesNotMatch(settings, /choice-style/);
        assert.doesNotMatch(settings, /name="story-format"/);
        assert.doesNotMatch(settings, /id="custom-aspect-ratio"/);
        assert.match(html, /<div id="player" data-story-format="vertical">/);
        const settingsCss = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.css"), "utf8");
        assert.match(settingsCss, /\[hidden\]\s*\{\s*display:\s*none !important;/);
        assert.match(settingsCss, /\.segmented\s*\{[^}]*gap:\s*2px;[^}]*background:\s*var\(--border\);/);
        assert.match(settings, /id="line-height" min="1" max="2\.2" step="0\.05"/);
    });

    it("keeps the Visual settings scrollbar visible", function () {
        const css = fs.readFileSync(path.join(__dirname, "../renderer/gameSettings/gameSettings.css"), "utf8");

        assert.match(css, /#settings-scroll\s*\{[^}]*overflow-y:\s*auto;/);
        assert.doesNotMatch(css, /scrollbar-width:\s*none|-ms-overflow-style:\s*none|::-webkit-scrollbar\s*\{\s*display:\s*none/);
    });

    it("exports the selected palette as fixed colors without a theme switch", function () {
        const parsed = GameStyle.parseText("theme: dark\n");
        const css = GameStyle.exportCss(parsed.style);

        assert.match(css, /--bg: #282828;/);
        assert.match(css, /--text: #faf1c6;/);
        assert.doesNotMatch(css, /body\.dark/);
    });

    it("makes automatic hover the Choices color and respects a custom hover color", function () {
        const auto = GameStyle.parseText('theme: dark\ncolors:\n  choice: "#ffd54a"\n').style;
        assert.strictEqual(auto.colors.choiceHover, "#ffd54a");
        assert.match(GameStyle.exportCss(auto), /--link-hover: #ffd54a;/);
        const light = GameStyle.parseText("theme: light\n").style;
        assert.strictEqual(light.colors.choiceHover, light.colors.choice);
        const custom = GameStyle.parseText('colors:\n  choice_hover: "#ff00aa"\n').style;
        assert.strictEqual(custom.colors.choiceHover, "#ff00aa");
        assert.match(GameStyle.exportCss(custom), /--link-hover: #ff00aa;/);
    });

    it("opens the retired auto theme as light, without warnings, and never writes it back", function () {
        const parsed = GameStyle.parseText('theme: auto\ncolors:\n  choice: "#8b4513"\n');
        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.model.theme, "light");
        assert.strictEqual(parsed.style.colors.background, "#ffffff");
        assert.strictEqual(parsed.style.colors.choice, "#8b4513");
        assert.doesNotMatch(GameStyle.toYaml(parsed.model), /theme: auto/);
        assert.match(GameStyle.toYaml(parsed.model), /^theme: light/);
        assert.doesNotMatch(GameStyle.exportCss(parsed.style), /prefers-color-scheme/);
        assert.deepStrictEqual(GameStyle.parseText("theme: Auto\n").warnings, []);
        assert.strictEqual(GameStyle.parseText("theme: sunset\n").warnings.length, 1);
    });

    it("preserves the initial reader volume and loads the three audio mix levels", function () {
        assert.deepStrictEqual(GameStyle.defaultModel().audio, {
            volume: 50, master: 100, music: 100, sfx: 100
        });
        const parsed = GameStyle.parseText("audio:\n  volume: 30\n");
        assert.strictEqual(parsed.model.audio.volume, 30);
        assert.deepStrictEqual(
            { master: parsed.model.audio.master, music: parsed.model.audio.music, sfx: parsed.model.audio.sfx },
            { master: 100, music: 100, sfx: 100 }
        );
        assert.deepStrictEqual(parsed.warnings, []);
        const configured = GameStyle.parseText([
            "audio:",
            "  volume: 30",
            "  master: 50",
            "  music: 11",
            "  sfx: 18",
            ""
        ].join("\n"));
        assert.deepStrictEqual(configured.model.audio, { volume: 30, master: 50, music: 11, sfx: 18 });
        assert.deepStrictEqual(GameStyle.parseText(GameStyle.toYaml(configured.model)).model.audio, configured.model.audio);
        assert.match(GameStyle.templateYaml(), /audio:\n  volume: 50/);
        assert.match(GameStyle.templateYaml(), /master: 100\n  music: 100\n  sfx: 100/);
        const tooLoud = GameStyle.parseText("audio:\n  volume: 300\n");
        assert.strictEqual(tooLoud.model.audio.volume, 50);
        assert.ok(tooLoud.warnings.length > 0);
        const invalidSfx = GameStyle.parseText("audio:\n  sfx: 101\n");
        assert.strictEqual(invalidSfx.model.audio.sfx, 100);
        assert.match(invalidSfx.warnings.join("\n"), /audio\.sfx.*between 0 and 100/);
        assert.deepStrictEqual(GameStyle.parseText(GameStyle.templateYaml()).warnings, []);
    });

    it("warns about non-object YAML and invalid unquoted hexadecimal colors", function () {
        const scalar = GameStyle.parseText("not a mapping\n");
        const invalidColor = GameStyle.parseText("colors:\n  background: #abcdefg\n");

        assert.match(scalar.warnings.join("\n"), /game\.yaml should contain options/);
        assert.match(invalidColor.warnings.join("\n"), /colors\.background.*not a valid color/);
    });

    it("treats prototype property names as custom font names", function () {
        const parsed = GameStyle.parseText([
            "font:",
            "  family: constructor",
            "titles:",
            "  scene_style:",
            "    family: __proto__",
            ""
        ].join("\n"));
        const css = GameStyle.exportCss(parsed.style);

        assert.strictEqual(parsed.model.font.family, "constructor");
        assert.strictEqual(parsed.model.titles.sceneStyle.family, "inherit");
        assert.match(parsed.warnings.join("\n"), /titles\.scene_style\.family.*not valid/);
        assert.doesNotMatch(css, /\[native code\]|function Object/);
    });
});
