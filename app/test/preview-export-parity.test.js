const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JSDOM } = require("jsdom");
const ink = require("inkjs");
const { buildWebExport } = require("../renderer/webExporter.js");

describe("Preview and Web Export parity", function () {
    for (const presentation of ["traditional", "screen"]) {
        it("renders passages, choices and endings in " + presentation + " mode", async function () {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-player-parity-"));
            const previous = {
                window: global.window,
                document: global.document,
                DOMParser: global.DOMParser,
                NodeFilter: global.NodeFilter
            };
            const playerPath = require.resolve("../renderer/playerView.js");
            const jqueryPath = require.resolve("../renderer/jquery-2.2.3.min.js");
            let preview, exported;
            try {
                const source = "First line.\n#screen\nSecond line.\n* [Continue]\n  Final line.\n  -> END\n";
                const compiled = new ink.Compiler(source).Compile().ToJson();
                const compiledPath = path.join(root, "story.json");
                const output = path.join(root, "web");
                fs.writeFileSync(compiledPath, compiled);
                await buildWebExport({
                    compiledJsonPath: compiledPath,
                    targetDirectory: output,
                    templateDirectory: path.join(__dirname, "../export-for-web-template"),
                    inkRuntimePath: require.resolve("inkjs/dist/ink.js"),
                    presentation
                });

                preview = new JSDOM('<div id="player" data-title-started="1" data-presentation="' +
                    presentation + '"><div class="innerText active"></div></div>');
                Object.assign(global, {
                    window: preview.window,
                    document: preview.window.document,
                    DOMParser: preview.window.DOMParser,
                    NodeFilter: preview.window.NodeFilter
                });
                delete require.cache[jqueryPath];
                delete require.cache[playerPath];
                const player = require("../renderer/playerView.js").PlayerView;
                player.setAnimationEnabled(false);
                const previewStory = new ink.Story(compiled);
                function renderPreview() {
                    while (previewStory.canContinue) {
                        player.addTextSection(previewStory.Continue());
                        player.addTags(previewStory.currentTags);
                    }
                    for (const choice of previewStory.currentChoices) {
                        player.addChoice({ choice }, () => {
                            previewStory.ChooseChoiceIndex(choice.index);
                            renderPreview();
                        });
                    }
                    if (!previewStory.currentChoices.length) player.addEndingMarker();
                    player.contentReady();
                }
                renderPreview();

                exported = new JSDOM(fs.readFileSync(path.join(output, "index.html"), "utf8"), {
                    url: "https://story.test/", runScripts: "outside-only"
                });
                exported.window.matchMedia = () => ({ matches: false });
                for (const script of exported.window.document.querySelectorAll("script[src]")) {
                    exported.window.eval(fs.readFileSync(path.join(output, script.getAttribute("src")), "utf8"));
                }
                exported.window.document.querySelector("#title-screen .choice-button").click();

                const snapshot = (document, frame, passage, choices) => ({
                    paragraphs: Array.from(document.querySelectorAll(passage + " p:not(.choice):not(.tags)"),
                        element => element.textContent.trim()).filter(Boolean),
                    choices: Array.from(document.querySelectorAll(choices + " .choice-button"),
                        element => element.textContent.trim()),
                    ending: document.querySelector(frame + " .story-ending")?.textContent.trim() || null
                });
                const previewSnapshot = () => snapshot(preview.window.document, ".innerText.active",
                    ".innerText.active .story-passage", ".innerText.active .story-choices");
                const exportSnapshot = () => snapshot(exported.window.document, "#story",
                    "#story-passage", "#story-choices");
                const expected = presentation === "screen" ? ["Second line."] : ["First line.", "Second line."];
                assert.deepStrictEqual(previewSnapshot(), { paragraphs: expected, choices: ["Continue"], ending: null });
                assert.deepStrictEqual(exportSnapshot(), previewSnapshot());

                preview.window.document.querySelector(".story-choices .choice-button").click();
                exported.window.document.querySelector("#story-choices .choice-button").click();
                assert.deepStrictEqual(previewSnapshot(), { paragraphs: ["Final line."], choices: ["Play Again"], ending: "The End" });
                assert.deepStrictEqual(exportSnapshot(), previewSnapshot());
            } finally {
                delete require.cache[playerPath];
                delete require.cache[jqueryPath];
                for (const [key, value] of Object.entries(previous)) {
                    if (value === undefined) delete global[key];
                    else global[key] = value;
                }
                if (preview) preview.window.close();
                if (exported) exported.window.close();
                fs.rmSync(root, { recursive: true, force: true });
            }
        });
    }
});
