const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { isSoundTag, safeAudioFile, parseAudioTag, collectAudioFromStory, isAudioFileName, resolveAudioFile, listUsableAudioFiles } = require("../renderer/audioTags.js");

describe("Sound tags", function () {
    it("reads music and sound tags and rejects unsafe file names", function () {
        assert.deepStrictEqual(parseAudioTag("music: floresta.mp3"), { kind: "music", file: "floresta.mp3" });
        assert.deepStrictEqual(parseAudioTag(" # Sound : galho quebrando.OGG "), { kind: "sound", file: "galho quebrando.OGG" });
        assert.deepStrictEqual(parseAudioTag("sound: stop"), { kind: "sound", stop: true });
        assert.deepStrictEqual(parseAudioTag("music: stop"), { kind: "music", file: null });
        assert.strictEqual(parseAudioTag("audio: effects/branch.ogg"), null);
        assert.strictEqual(parseAudioTag("audioloop: stop"), null);
        assert.strictEqual(parseAudioTag("audioloop: https://example.test/theme.ogg"), null);
        assert.strictEqual(parseAudioTag("align: center"), null);
        assert.strictEqual(parseAudioTag("title: music: x"), null);
        assert.deepStrictEqual(parseAudioTag("sound: ../segredo.mp3"), { kind: "sound", file: "../segredo.mp3" });
        assert.deepStrictEqual(parseAudioTag("music: sub/pasta.mp3"), { kind: "music", file: "sub/pasta.mp3" });
        assert.deepStrictEqual(parseAudioTag("music: nota.txt"), { kind: "music", invalid: "nota.txt" });
        assert.strictEqual(safeAudioFile("a.mp3"), "a.mp3");
        assert.strictEqual(safeAudioFile(".mp3"), null);
        assert.strictEqual(safeAudioFile("a\\b.mp3"), null);
    });

    it("finds the sound files a compiled story uses", function () {
        const story = { root: [["^Você acorda.", "#", "^music: ", "^floresta.mp3 ", "/#", { "#": "sound: galho.mp3" }, "^music: isto é texto.mp3", "\n"], "done", null], inkVersion: 21 };
        const found = collectAudioFromStory(story);
        assert.strictEqual(found.usesAudio, true);
        assert.deepStrictEqual(found.files, ["floresta.mp3", "galho.mp3"]);
        assert.deepStrictEqual(collectAudioFromStory({ root: [["^texto", "\n"]] }), {
            usesAudio: false, files: [], musicFiles: [], soundFiles: [], invalid: []
        });
        // The retired audio and audioloop tags are not sound tags any more.
        assert.deepStrictEqual(collectAudioFromStory({ root: [{ "#": "audioloop: x.mp3" }] }), {
            usesAudio: false, files: [], musicFiles: [], soundFiles: [], invalid: []
        });
        assert.deepStrictEqual(collectAudioFromStory({ root: [{ "#": "audio: effects/branch.ogg" }] }), {
            usesAudio: false, files: [], musicFiles: [], soundFiles: [], invalid: []
        });
        assert.deepStrictEqual(collectAudioFromStory({ root: [{ "#": "sound: stop" }] }), {
            usesAudio: true, files: [], musicFiles: [], soundFiles: [], invalid: []
        });
        // The real thing, as inklecate writes it.
        const compiled = JSON.parse('{"inkVersion":21,"root":[["^Olá ","#","^music: floresta.mp3 ","/#","#","^sound: galho.mp3","/#","\\n","ev","str","^Escolha ","#","^music: stop","/#","/str","/ev",{"*":"0.c-0","flg":20},{"c-0":["\\n","end"]}],"done",null]}');
        const real = collectAudioFromStory(compiled);
        assert.deepStrictEqual(real.files, ["floresta.mp3", "galho.mp3"]);
        assert.deepStrictEqual(real.musicFiles, ["floresta.mp3"]);
        assert.deepStrictEqual(real.soundFiles, ["galho.mp3"]);
        assert.strictEqual(real.usesAudio, true);
    });

    it("recognises the usual sound file types, in any letter case", function () {
        ["a.mp3", "a.MP3", "a.wav", "a.ogg", "a.oga", "a.m4a", "a.aac", "a.flac", "a.opus", "a.webm"].forEach(name => assert.ok(isAudioFileName(name), name));
        ["a.txt", "a.ink", "a.yaml", "a.png", "mp3", ""].forEach(name => assert.ok(!isAudioFileName(name), name));
    });

    it("finds sound files in category folders after audio and before the project root", function () {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-audio-"));
        try {
            fs.mkdirSync(path.join(dir, "audio"));
            fs.mkdirSync(path.join(dir, "audio", "musics"));
            fs.mkdirSync(path.join(dir, "audio", "sfx"));
            fs.mkdirSync(path.join(dir, "music"));
            fs.mkdirSync(path.join(dir, "musics"));
            fs.mkdirSync(path.join(dir, "sfx"));
            fs.mkdirSync(path.join(dir, "custom", "music"), { recursive: true });
            fs.writeFileSync(path.join(dir, "audio", "floresta.mp3"), "");
            fs.writeFileSync(path.join(dir, "audio", "musics", "tema-interno.mp3"), "");
            fs.writeFileSync(path.join(dir, "audio", "sfx", "porta-interna.wav"), "");
            fs.writeFileSync(path.join(dir, "passos.wav"), "");
            fs.writeFileSync(path.join(dir, "audio", "passos.wav"), "");
            fs.writeFileSync(path.join(dir, "music", "tema.mp3"), "");
            fs.writeFileSync(path.join(dir, "audio", "tema.mp3"), "");
            fs.writeFileSync(path.join(dir, "musics", "abertura.mp3"), "");
            fs.writeFileSync(path.join(dir, "sfx", "porta.wav"), "");
            fs.writeFileSync(path.join(dir, "custom", "music", "fora.mp3"), "");
            fs.writeFileSync(path.join(dir, "notas.txt"), "");
            assert.strictEqual(resolveAudioFile(dir, "floresta.mp3"), path.join(dir, "audio", "floresta.mp3"));
            assert.strictEqual(resolveAudioFile(dir, "tema-interno.mp3", "sound"), path.join(dir, "audio", "musics", "tema-interno.mp3"));
            assert.strictEqual(resolveAudioFile(dir, "porta-interna.wav", "music"), path.join(dir, "audio", "sfx", "porta-interna.wav"));
            // the audio folder wins when both have the file
            assert.strictEqual(resolveAudioFile(dir, "passos.wav"), path.join(dir, "audio", "passos.wav"));
            fs.rmSync(path.join(dir, "audio", "passos.wav"));
            assert.strictEqual(resolveAudioFile(dir, "passos.wav"), path.join(dir, "passos.wav"));
            assert.strictEqual(resolveAudioFile(dir, "tema.mp3", "music"), path.join(dir, "audio", "tema.mp3"));
            assert.strictEqual(resolveAudioFile(dir, "abertura.mp3", "music"), path.join(dir, "musics", "abertura.mp3"));
            assert.strictEqual(resolveAudioFile(dir, "porta.wav", "sound"), path.join(dir, "sfx", "porta.wav"));
            assert.strictEqual(resolveAudioFile(dir, "porta.wav", "music"), path.join(dir, "sfx", "porta.wav"));
            assert.strictEqual(resolveAudioFile(dir, "abertura.mp3", "sound"), path.join(dir, "musics", "abertura.mp3"));
            assert.strictEqual(resolveAudioFile(dir, "custom/music/fora.mp3"), path.join(dir, "custom", "music", "fora.mp3"));
            assert.strictEqual(resolveAudioFile(dir, path.join(dir, "custom", "music", "fora.mp3")), path.join(dir, "custom", "music", "fora.mp3"));
            assert.strictEqual(resolveAudioFile(dir, "nada.mp3"), null);
            assert.strictEqual(resolveAudioFile(dir, "../fora.mp3"), null);
            const usableFiles = listUsableAudioFiles(dir);
            assert.deepStrictEqual(usableFiles, ["floresta.mp3", "porta-interna.wav", "tema-interno.mp3", "tema.mp3"]);
            ["abertura.mp3", "custom/music/fora.mp3", "passos.wav", "porta.wav"].forEach(name => {
                assert.ok(!usableFiles.includes(name), name + " is outside audio/audios");
            });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("lists only the audio and audios folders, with their music, musics and sfx subfolders", function () {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-music-folders-"));
        try {
            const put = relative => {
                const file = path.join(dir, ...relative.split("/"));
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, relative);
            };
            put("audio/direct.mp3");
            put("audio/music/inner.mp3");
            put("audios/musics/inner-too.mp3");
            put("music/top.mp3");
            put("musics/top-too.mp3");
            put("other/music/outside.mp3");
            put("other/song.mp3");

            const music = listUsableAudioFiles(dir, "music");
            assert.deepStrictEqual(music, ["direct.mp3", "inner-too.mp3", "inner.mp3"]);

            // The sound tag lists the same folders: nothing outside audio and audios is offered.
            const all = listUsableAudioFiles(dir);
            assert.deepStrictEqual(all, ["direct.mp3", "inner-too.mp3", "inner.mp3"]);
            ["top.mp3", "top-too.mp3", "other/music/outside.mp3", "other/song.mp3"].forEach(name => assert.ok(!all.includes(name), name));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("knows which tags are sound tags, so they never show as text", function () {
        ["music: a.mp3", " # Sound : b.wav", "music: stop", "sound: stop"].forEach(tag => assert.ok(isSoundTag(tag), tag));
        ["clean", "align: center", "title: musica", "cor: azul", "musical: x", "audio: c.ogg", "audioloop:d.mp3", ""].forEach(tag => assert.ok(!isSoundTag(tag), tag));
    });
    it("treats the audios folder like audio: bare names are found there and offered without a path", function () {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-audios-"));
        try {
            const put = relative => {
                const file = path.join(dir, ...relative.split("/"));
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, relative);
            };
            put("audios/dark.mp3");
            put("audios/musics/theme.mp3");
            put("audios/sfx/door.wav");
            put("audio/both.mp3");
            put("audios/both.mp3");
            put("other/far.mp3");

            assert.strictEqual(resolveAudioFile(dir, "dark.mp3"), path.join(dir, "audios", "dark.mp3"));
            assert.strictEqual(resolveAudioFile(dir, "theme.mp3"), path.join(dir, "audios", "musics", "theme.mp3"));
            assert.strictEqual(resolveAudioFile(dir, "door.wav"), path.join(dir, "audios", "sfx", "door.wav"));
            assert.strictEqual(resolveAudioFile(dir, "both.mp3"), path.join(dir, "audio", "both.mp3"), "audio is searched before audios");
            assert.strictEqual(resolveAudioFile(dir, "audios/dark.mp3"), path.join(dir, "audios", "dark.mp3"), "the explicit path still works");
            assert.strictEqual(resolveAudioFile(dir, "far.mp3"), null, "other folders still need their path");

            const offered = listUsableAudioFiles(dir);
            ["dark.mp3", "theme.mp3", "door.wav", "both.mp3"].forEach(name => assert.ok(offered.includes(name), name));
            assert.ok(!offered.includes("other/far.mp3"), "a sound outside audio/audios is not listed");
            assert.ok(!offered.some(name => name.startsWith("audios/")), "no audios/ prefix: " + offered.join(", "));
            assert.strictEqual(offered.filter(name => name === "both.mp3").length, 1);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
