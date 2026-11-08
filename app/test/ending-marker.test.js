const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { GameStyle } = require("../renderer/gameStyle.js");
const EndingMarker = require("../renderer/endingMarker.js");

const read = filename => fs.readFileSync(path.join(__dirname, "..", filename), "utf8");

describe("Story ending marker", function() {
    it("keeps older projects valid with an enabled The End marker", function() {
        const result = GameStyle.parseText("theme: dark\npresentation: traditional\n");
        assert.deepStrictEqual(result.warnings, []);
        assert.deepStrictEqual(result.model.ending, { show: true, text: "The End", playAgainShow: true, playAgainText: "Play Again" });
        assert.deepStrictEqual(result.style.ending, result.model.ending);
    });

    it("round-trips explicit marker settings in game.yaml", function() {
        const source = 'ending:\n  show: false\n  text: "The End"\n';
        const parsed = GameStyle.parseText(source);
        assert.deepStrictEqual(parsed.model.ending, { show: false, text: "The End", playAgainShow: true, playAgainText: "Play Again" });
        const saved = GameStyle.toYaml(parsed.model);
        assert.match(saved, /^ending:\n  show: false\n  text: "The End"\n  play_again_show: true\n  play_again_text: "Play Again"$/m);
        assert.deepStrictEqual(GameStyle.parseText(saved).model.ending, parsed.model.ending);
    });

    it("rejects invalid marker values without losing story presentation", function() {
        const result = GameStyle.resolve({ ending: { show: "no", text: "" }, presentation: "screen" });
        assert.strictEqual(result.style.presentation, "screen");
        assert.deepStrictEqual(result.style.ending, { show: true, text: "The End", playAgainShow: true, playAgainText: "Play Again" });
        assert.ok(result.warnings.length >= 2);
    });

    it("lets the author independently customize marker and replay in YAML", function() {
        const source = 'ending:\n  show: false\n  text: "Fin"\n  play_again_show: true\n  play_again_text: "Play from beginning"\n';
        const parsed = GameStyle.parseText(source);
        assert.deepStrictEqual(parsed.warnings, []);
        assert.deepStrictEqual(parsed.style.ending, {
            show: false, text: "Fin", playAgainShow: true, playAgainText: "Play from beginning"
        });
        const serialized = GameStyle.toYaml(parsed.model);
        assert.match(serialized, /play_again_show: true/);
        assert.match(serialized, /play_again_text: "Play from beginning"/);
        assert.deepStrictEqual(GameStyle.parseText(serialized).model.ending, parsed.model.ending);
        assert.strictEqual(EndingMarker.createReplayChoice({
            createElement: tag => ({
                tag, className: "", type: "", textContent: "", children: [],
                appendChild(child) { this.children.push(child); }
            })
        }, "Start Over").children[0].textContent, "Start Over");
    });

    it("rejects invalid replay options and retains compatible defaults", function() {
        const result = GameStyle.parseText('ending:\n  play_again_show: "no"\n  play_again_text: ""\n');
        assert.deepStrictEqual(result.model.ending, {
            show: true, text: "The End", playAgainShow: true, playAgainText: "Play Again"
        });
        assert.ok(result.warnings.length >= 2);
    });

    it("renders the two rules as real SVG strokes, never collapsing pseudo-elements", function() {
        const helper = read("renderer/endingMarker.js");
        assert.match(helper, /createElementNS\(SVG_NS, "svg"\)/);
        assert.match(helper, /M0 12 H104/);
        assert.match(helper, /M136 12 H240/);
        assert.match(helper, /M120 3 L129 12 L120 21 L111 12 Z/);
        for (const cssFile of ["renderer/gameChrome.css", "export-for-web-template/style.css"]) {
            const css = read(cssFile);
            assert.match(css, /\.story-ending-line\s*\{[^}]*stroke:\s*currentColor/s);
            assert.match(css, /\.story-ending-diamond\s*\{[^}]*fill:\s*currentColor/s);
            assert.doesNotMatch(css, /\.story-ending-ornament::(?:before|after)/);
        }
    });

    it("uses a shared markup builder and matching style rules in Preview and Export", function() {
        assert.strictEqual(EndingMarker.DEFAULT_TEXT, "The End");
        assert.strictEqual(EndingMarker.REPLAY_LABEL, "Play Again");
        const helper = read("renderer/endingMarker.js");
        assert.match(helper, /function createReplayChoice\(doc, label\)/);
        assert.match(read("renderer/playerView.js"), /EndingMarker\.createReplayChoice\(document,/);
        assert.match(read("renderer/controller.js"), /"restartStory": \(\) => restartStory\(\)/);
        assert.match(read("export-for-web-template/main.js"), /EndingMarker\.createReplayChoice\(document,/);
        assert.match(read("export-for-web-template/main.js"), /addEventListener\("click", returnToTitleScreen\)/);
        const ink = fs.readFileSync(path.join(__dirname, "../resources/showcase/before-dawn/Before Dawn.ink"), "utf8");
        assert.doesNotMatch(ink, /\+ \[Play Again\]/);
        assert.strictEqual((ink.match(/-> END/g) || []).length, 3);

        assert.match(read("renderer/playerView.js"), /EndingMarker\.create\(document/);
        assert.match(read("export-for-web-template/main.js"), /EndingMarker\.create\(document/);
        assert.match(read("renderer/controller.js"), /PlayerView\.addEndingMarker\(\)/);
        assert.doesNotMatch(read("renderer/controller.js"), /addTerminatingMessage\(i18n\._\("End of story"\)/);
        assert.match(read("renderer/gameStyle.js"), /player\.dataset\.endingShow/);
        assert.match(read("renderer/gameSettings/gameSettings.html"), /id="ending-show"/);
        assert.match(read("renderer/gameSettings/gameSettings.html"), /id="ending-text"/);
        assert.match(read("renderer/gameSettings/gameSettings.html"), /id="ending-play-again-show"/);
        assert.match(read("renderer/gameSettings/gameSettings.html"), /id="ending-play-again-text"/);
        assert.match(read("renderer/webExporter.js"), /##PLAY-AGAIN-TEXT##/);
        assert.match(read("renderer/webExporter.js"), /##ENDING-SHOW##/);
        assert.match(read("renderer/webExporter.js"), /ending-marker\.js/);
        assert.match(read("renderer/gameChrome.css"), /story-ending-diamond/);
        assert.match(read("export-for-web-template/style.css"), /story-ending-diamond/);
        assert.match(read("export-for-web-template/main.js"), /!story\.canContinue && story\.currentChoices\.length === 0/);
    });
});
