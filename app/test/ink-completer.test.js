const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const inkCompleter = require("../renderer/inkCompleter.js").inkCompleter;

function complete(line, projectDir) {
    inkCompleter.getProjectDir = () => projectDir;
    let result = null;
    const session = { getLine: () => line };
    inkCompleter.getCompletions({}, session, { row: 0, column: line.length }, "", (error, list) => { result = list; });
    return result;
}

describe("Tag autocomplete", function () {
    it("offers vocabulary on an empty Ace line without a cursor token", function () {
        const previous = inkCompleter.inkFiles;
        inkCompleter.inkFiles = [{ symbols: { getCachedVocabWords: () => ["lantern"] } }];
        try {
            let result;
            inkCompleter.getCompletions({}, { getLine: () => "", getTokenAt: () => null },
                {row: 0, column: 0}, "", (error, list) => {
                    assert.ifError(error);
                    result = list;
                });
            assert.deepStrictEqual(result, [{caption: "lantern", value: "lantern", meta: "Vocabulary"}]);
        } finally { inkCompleter.inkFiles = previous; }
    });

    it("offers music and SFX from their conventional folders and custom audio paths", function () {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-completer-"));
        fs.mkdirSync(path.join(dir, "audio", "music"), { recursive: true });
        fs.mkdirSync(path.join(dir, "audio", "sfx"), { recursive: true });
        fs.mkdirSync(path.join(dir, "audio", "ambience"), { recursive: true });
        fs.mkdirSync(path.join(dir, "audio", "custom ambience"), { recursive: true });
        fs.mkdirSync(path.join(dir, "music"));
        fs.mkdirSync(path.join(dir, "sfx"));
        ["voice.mp3", "notes.txt"].forEach(name => fs.writeFileSync(path.join(dir, "audio", name), ""));
        fs.writeFileSync(path.join(dir, "audio", "music", "forest-theme.mp3"), "");
        fs.writeFileSync(path.join(dir, "audio", "sfx", "branch.wav"), "");
        fs.writeFileSync(path.join(dir, "audio", "ambience", "wind.mp3"), "");
        fs.writeFileSync(path.join(dir, "audio", "custom ambience", "wind strong.mp3"), "");
        fs.writeFileSync(path.join(dir, "music", "outside.mp3"), "");
        fs.writeFileSync(path.join(dir, "sfx", "outside.wav"), "");
        try {
            const tags = complete("You wake up. # ", dir).map(item => item.value);
            ["title: ", "music: ", "music: stop", "sound: ", "music: voice.mp3", "sound: voice.mp3",
                "music: audio/ambience/wind.mp3", "sound: audio/custom ambience/wind strong.mp3"].forEach(value => assert.ok(tags.includes(value), value));
            assert.ok(!tags.includes("clean"), "the retired clean tag is no longer suggested");
            assert.ok(!tags.some(value => /notes\.txt/.test(value)));
            assert.deepStrictEqual(complete("Texto # choice-align: ", dir).map(item => item.value), ["left", "center", "right"]);

            const musicFiles = complete("Texto # music: ", dir).map(item => item.value);
            const soundFiles = complete("Texto # sound: ", dir).map(item => item.value);
            assert.ok(musicFiles.includes("forest-theme.mp3"));
            assert.ok(!musicFiles.includes("branch.wav"));
            assert.ok(soundFiles.includes("branch.wav"));
            assert.ok(!soundFiles.includes("forest-theme.mp3"));
            ["voice.mp3", "audio/ambience/wind.mp3", "audio/custom ambience/wind strong.mp3"].forEach(name => {
                assert.ok(musicFiles.includes(name), name);
                assert.ok(soundFiles.includes(name), name);
            });
            ["outside.mp3", "outside.wav"].forEach(name => {
                assert.ok(!musicFiles.includes(name), name + " is not offered as music");
                assert.ok(!soundFiles.includes(name), name + " is not offered as sound");
            });
            assert.ok(tags.includes("sound: stop"));
            assert.deepStrictEqual(complete("Texto # align: ", dir).map(item => item.value), ["left", "center", "right"]);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("offers images and backgrounds from their dedicated folders", function () {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-completer-image-"));
        const write = (relative, text) => {
            const file = path.join(dir, ...relative.split("/"));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, text || "");
        };
        write("image/hero.png");
        write("image/character/elara.png");
        write("image/background/forest.jpg");
        write("image/background/cave.png");
        write("scenes/room.png");
        write("notes.txt");
        try {
            const images = complete("You wake up. # image: ", dir).map(item => item.value);
            const backgrounds = complete("You wake up. # bg: ", dir).map(item => item.value);
            assert.deepStrictEqual(images, ["hero.png", "image/background/cave.png", "image/background/forest.jpg", "image/character/elara.png"]);
            assert.deepStrictEqual(backgrounds, ["cave.png", "forest.jpg"]);
            assert.ok(!images.some(name => /notes\.txt/.test(name)));
            const tags = complete("You wake up. # ", dir).map(item => item.value);
            assert.ok(tags.includes("image: hero.png"));
            assert.ok(tags.includes("bg: "));
            assert.ok(tags.includes("image: "));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("still offers the sound tags when the project has no audio folder", function () {
        const tags = complete("# ", null).map(item => item.value);
        assert.ok(tags.includes("music: ") && tags.includes("sound: "));
        assert.deepStrictEqual(complete("# music: ", "/nonexistent/folder").map(item => item.value), ["stop"]);
        assert.deepStrictEqual(complete("# sound: ", "/nonexistent/folder").map(item => item.value), ["stop"]);
    });
    it("lists #image like the other tags: a short name, no description, \"Ink Tag\" on the right", function () {
        const items = complete("You wake up. # ", null);
        const sceneTitle = items.find(item => item.value === "title: ");
        const image = items.find(item => item.value === "image: ");
        assert.ok(image, "image tag is offered");
        assert.strictEqual(image.caption, "#image");
        assert.strictEqual(image.meta, "Ink Tag");
        assert.deepStrictEqual(Object.keys(image).sort(), Object.keys(sceneTitle).sort(), "same shape as the other tags: no description or extra fields");
        assert.strictEqual(items.filter(item => /^image/.test(item.value)).length, 1);
    });
});
