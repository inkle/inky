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
    it("offers the sound tags and the files of the audio folder", function () {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-completer-"));
        fs.mkdirSync(path.join(dir, "audio"));
        fs.mkdirSync(path.join(dir, "audio", "musics"));
        fs.mkdirSync(path.join(dir, "audio", "sfx"));
        fs.mkdirSync(path.join(dir, "audio", "ambience"), { recursive: true });
        fs.mkdirSync(path.join(dir, "audio", "custom ambience"));
        fs.mkdirSync(path.join(dir, "custom"));
        fs.mkdirSync(path.join(dir, "music"));
        fs.mkdirSync(path.join(dir, "musics"));
        fs.mkdirSync(path.join(dir, "sfx"));
        ["floresta.mp3", "galho.wav", "notas.txt"].forEach(name => fs.writeFileSync(path.join(dir, "audio", name), ""));
        fs.writeFileSync(path.join(dir, "music", "tema.mp3"), "");
        fs.writeFileSync(path.join(dir, "musics", "abertura.ogg"), "");
        fs.writeFileSync(path.join(dir, "sfx", "porta.wav"), "");
        fs.writeFileSync(path.join(dir, "audio", "musics", "tema-interno.mp3"), "");
        fs.writeFileSync(path.join(dir, "audio", "sfx", "porta-interna.wav"), "");
        fs.writeFileSync(path.join(dir, "audio", "ambience", "vento.mp3"), "");
        fs.writeFileSync(path.join(dir, "audio", "custom ambience", "vento forte.mp3"), "");
        fs.writeFileSync(path.join(dir, "custom", "fora.mp3"), "");
        try {
            const tags = complete("Você acorda. # ", dir).map(item => item.value);
            ["title: ", "music: ", "music: stop", "sound: ", "music: floresta.mp3", "sound: galho.wav", "music: audio/ambience/vento.mp3", "music: audio/custom ambience/vento forte.mp3"].forEach(value => assert.ok(tags.includes(value), value));
            assert.ok(!tags.includes("clean"), "the retired clean tag is no longer suggested");
            assert.ok(!tags.some(value => /notas\.txt/.test(value)));
            assert.deepStrictEqual(complete("Texto # choice-align: ", dir).map(item => item.value), ["left", "center", "right"]);

            const musicFiles = complete("Texto # music: ", dir).map(item => item.value);
            const soundFiles = complete("Texto # sound: ", dir).map(item => item.value);
            const insideAudio = ["floresta.mp3", "galho.wav", "tema-interno.mp3", "porta-interna.wav", "audio/ambience/vento.mp3", "audio/custom ambience/vento forte.mp3"];
            insideAudio.forEach(name => {
                assert.ok(musicFiles.includes(name), name);
                assert.ok(soundFiles.includes(name), name);
            });
            // Only audio/audios are listed: files in top-level music/, musics/, sfx/ or other folders are not.
            ["tema.mp3", "abertura.ogg", "porta.wav", "custom/fora.mp3"].forEach(name => {
                assert.ok(!musicFiles.includes(name), name + " is not offered as music");
                assert.ok(!soundFiles.includes(name), name + " is not offered as sound");
                assert.ok(!tags.includes("music: " + name) && !tags.includes("sound: " + name), name + " gets no ready-made tag");
            });
            assert.ok(tags.includes("sound: stop"));
            assert.deepStrictEqual(complete("Texto # align: ", dir).map(item => item.value), ["left", "center", "right"]);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("offers the project's pictures after #image: and as ready-made tags", function () {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-completer-image-"));
        const write = (relative, text) => {
            const file = path.join(dir, ...relative.split("/"));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, text || "");
        };
        write("cover.jpg");
        write("images/hero.png");
        write("images/chapter1/room.jpg");
        write("image/moon.webp");
        write("scenes/room.png");
        write("notes.txt");
        try {
            const files = complete("Você acorda. # image: ", dir).map(item => item.value);
            assert.deepStrictEqual(files, ["chapter1/room.jpg", "hero.png", "moon.webp"]);
            assert.ok(!files.some(name => /notes\.txt/.test(name)));
            const tags = complete("Você acorda. # ", dir).map(item => item.value);
            assert.ok(tags.includes("image: hero.png"));
            assert.ok(tags.includes("image: chapter1/room.jpg"));
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
        const items = complete("Você acorda. # ", null);
        const sceneTitle = items.find(item => item.value === "title: ");
        const image = items.find(item => item.value === "image: ");
        assert.ok(image, "image tag is offered");
        assert.strictEqual(image.caption, "#image");
        assert.strictEqual(image.meta, "Ink Tag");
        assert.deepStrictEqual(Object.keys(image).sort(), Object.keys(sceneTitle).sort(), "same shape as the other tags: no description or extra fields");
        assert.strictEqual(items.filter(item => /^image/.test(item.value)).length, 1);
    });
});
