const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { isSoundTag, safeAudioFile, parseAudioTag, collectAudioFromStory, isAudioFileName, resolveAudioFile, resolveAudioReference, listUsableAudioFiles, AUDIO_FOLDER, AUDIO_MUSIC_FOLDER, AUDIO_SFX_FOLDER } = require("../renderer/audioTags.js");

function temp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function put(root, relative, text) {
    const file = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text || relative);
    return file;
}

describe("audio tags", function () {
    it("uses the agreed singular resource directories", function () {
        assert.strictEqual(AUDIO_FOLDER, "audio");
        assert.strictEqual(AUDIO_MUSIC_FOLDER, path.join("audio", "music"));
        assert.strictEqual(AUDIO_SFX_FOLDER, path.join("audio", "sfx"));
    });

    it("recognises music and sound tags and their stop commands", function () {
        assert.deepStrictEqual(parseAudioTag("music: forest.mp3"), { kind: "music", file: "forest.mp3" });
        assert.deepStrictEqual(parseAudioTag("# Sound: branch.ogg"), { kind: "sound", file: "branch.ogg" });
        assert.deepStrictEqual(parseAudioTag("music: stop"), { kind: "music", file: null });
        assert.deepStrictEqual(parseAudioTag("sound: stop"), { kind: "sound", stop: true });
        assert.deepStrictEqual(parseAudioTag("music: sub/pasta.mp3"), { kind: "music", file: "sub/pasta.mp3" });
        assert.deepStrictEqual(parseAudioTag("music: nota.txt"), { kind: "music", invalid: "nota.txt" });
        assert.strictEqual(safeAudioFile("a.mp3"), "a.mp3");
        assert.strictEqual(safeAudioFile(".mp3"), null);
        assert.strictEqual(safeAudioFile("a\\b.mp3"), null);
    });

    it("collects the music and SFX references separately", function () {
        const story = { root: [["^You wake up.", "#", "^music: ", "^forest.mp3 ", "/#", { "#": "sound: branch.mp3" }, "^music: this is text.mp3", "\n"], "done", null], inkVersion: 21 };
        const found = collectAudioFromStory(story);
        assert.strictEqual(found.usesAudio, true);
        assert.deepStrictEqual(found.files, ["branch.mp3", "forest.mp3"]);
        assert.deepStrictEqual(found.musicFiles, ["forest.mp3"]);
        assert.deepStrictEqual(found.soundFiles, ["branch.mp3"]);
        assert.deepStrictEqual(collectAudioFromStory({ root: [["^texto", "\n"]] }), {
            usesAudio: false, files: [], musicFiles: [], soundFiles: [], invalid: []
        });
        assert.deepStrictEqual(collectAudioFromStory({ root: [{ "#": "audioloop: x.mp3" }] }), {
            usesAudio: false, files: [], musicFiles: [], soundFiles: [], invalid: []
        });
        assert.deepStrictEqual(collectAudioFromStory({ root: [{ "#": "audio: effects/branch.ogg" }] }), {
            usesAudio: false, files: [], musicFiles: [], soundFiles: [], invalid: []
        });
    });

    it("recognises the supported audio formats", function () {
        ["a.mp3", "a.MP3", "a.wav", "a.ogg", "a.oga", "a.m4a", "a.aac", "a.flac", "a.opus", "a.webm"].forEach(name => assert.ok(isAudioFileName(name), name));
        ["a.txt", "a.ink", "a.yaml", "a.png", "mp3", ""].forEach(name => assert.ok(!isAudioFileName(name), name));
    });

    it("resolves bare names in the matching category and keeps custom explicit paths", function () {
        const dir = temp("inky-audio-layout-");
        try {
            const music = put(dir, "audio/music/theme.mp3");
            const sfx = put(dir, "audio/sfx/door.wav");
            const rootAudio = put(dir, "audio/voice.mp3");
            const custom = put(dir, "cinematic/ambience/forest.ogg");
            assert.strictEqual(resolveAudioFile(dir, "theme.mp3", "music"), music);
            assert.strictEqual(resolveAudioFile(dir, "door.wav", "sound"), sfx);
            assert.strictEqual(resolveAudioFile(dir, "voice.mp3", "music"), rootAudio);
            assert.strictEqual(resolveAudioFile(dir, "voice.mp3", "sound"), rootAudio);
            assert.strictEqual(resolveAudioFile(dir, "cinematic/ambience/forest.ogg", "sound"), custom);
            assert.strictEqual(resolveAudioFile(dir, "forest.ogg", "sound"), null);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it("allows identical filenames in music and SFX folders because the tag selects the category", function () {
        const dir = temp("inky-audio-same-name-");
        try {
            const music = put(dir, "audio/music/impact.mp3", "music bytes");
            const sfx = put(dir, "audio/sfx/impact.mp3", "sfx bytes");
            assert.strictEqual(resolveAudioFile(dir, "impact.mp3", "music"), music);
            assert.strictEqual(resolveAudioFile(dir, "impact.mp3", "sound"), sfx);
            assert.ok(listUsableAudioFiles(dir, "music").includes("impact.mp3"));
            assert.ok(listUsableAudioFiles(dir, "sound").includes("impact.mp3"));
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it("reports ambiguity when a bare name exists in more than one search location", function () {
        const dir = temp("inky-audio-ambiguous-");
        try {
            put(dir, "audio/theme.mp3");
            put(dir, "audio/music/theme.mp3");
            const resolved = resolveAudioReference(dir, "theme.mp3", "music");
            assert.strictEqual(resolved.kind, "ambiguous");
            assert.deepStrictEqual(resolved.candidates, ["audio/theme.mp3", "audio/music/theme.mp3"]);
            const suggestions = listUsableAudioFiles(dir, "music");
            assert.ok(suggestions.includes("audio/theme.mp3"));
            assert.ok(suggestions.includes("audio/music/theme.mp3"));
            assert.ok(!suggestions.includes("theme.mp3"));
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it("keeps old audios/musics folders discoverable for existing projects", function () {
        const dir = temp("inky-audio-legacy-");
        try {
            const legacy = put(dir, "audios/musics/old-theme.mp3");
            assert.strictEqual(resolveAudioFile(dir, "old-theme.mp3", "music"), legacy);
            assert.ok(listUsableAudioFiles(dir, "music").includes("old-theme.mp3"));
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it("keeps path traversal and unsupported files out", function () {
        const dir = temp("inky-audio-safe-");
        try {
            put(dir, "audio/music/good.mp3");
            assert.strictEqual(resolveAudioFile(dir, "../outside.mp3", "music"), null);
            const external = put(path.dirname(dir), path.basename(dir) + "-external.mp3", "outside");
            try {
                assert.strictEqual(resolveAudioFile(dir, external, "music"), null, "absolute path outside project");
                fs.symlinkSync(external, path.join(dir, "audio", "music", "external.mp3"));
                assert.strictEqual(resolveAudioFile(dir, "external.mp3", "music"), null, "symlink outside project");
            } finally { fs.rmSync(external, { force: true }); }
            assert.strictEqual(resolveAudioFile(dir, "missing.mp3", "music"), null);
            assert.strictEqual(resolveAudioFile(dir, "audio/music/good.txt", "music"), null);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it("knows which tags are sound tags, so they never show as text", function () {
        ["music: a.mp3", " # Sound : b.wav", "music: stop", "sound: stop"].forEach(tag => assert.ok(isSoundTag(tag), tag));
        ["clean", "align: center", "title: musica", "cor: azul", "musical: x", "audio: c.ogg", "audioloop:d.mp3", ""].forEach(tag => assert.ok(!isSoundTag(tag), tag));
    });
});
