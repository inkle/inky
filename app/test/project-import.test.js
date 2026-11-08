const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { importKind, planImport, applyImport, IMPORT_EXTENSIONS } = require("../renderer/projectImport.js");
const { IMAGE_EXTENSIONS, FAVICON_EXTENSIONS, COVER_EXTENSIONS, IMAGE_FOLDER, IMAGE_BACKGROUND_FOLDER, IMAGE_CHARACTER_FOLDER, LARGE_IMAGE_BYTES, isImageFileName, isFaviconFileName, imageMimeType } = require("../renderer/imageTypes.js");

function temp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

describe("project image formats", function () {
    it("keeps one list of picture formats, with favicon and cover as the narrower ones", function () {
        assert.deepStrictEqual(IMAGE_EXTENSIONS, Array.from(new Set(FAVICON_EXTENSIONS.concat(COVER_EXTENSIONS))));
        [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico"].forEach(ext => assert.ok(IMAGE_EXTENSIONS.includes(ext), ext));
        assert.ok(!COVER_EXTENSIONS.includes(".ico"), "an .ico is never a cover");
        assert.deepStrictEqual(FAVICON_EXTENSIONS, [".ico", ".png", ".svg"]);
        assert.strictEqual(IMAGE_FOLDER, "image");
        assert.strictEqual(IMAGE_BACKGROUND_FOLDER, path.join("image", "background"));
        assert.strictEqual(IMAGE_CHARACTER_FOLDER, path.join("image", "character"));
        ["cover.jpg", "COVER.JPEG", "a.png", "a.webp", "a.gif", "a.svg", "a.ico"].forEach(name => assert.ok(isImageFileName(name), name));
        ["notes.txt", "a.mp3", "a.jpg.bak", "a"].forEach(name => assert.strictEqual(isImageFileName(name), false, name));
    });

    it("recognizes the favicon by its name and format only", function () {
        ["favicon.ico", "favicon.png", "FAVICON.SVG", "any-name.ico"].forEach(name => assert.ok(isFaviconFileName(name), name));
        ["cover.png", "favicon.jpg", "favicon.gif", "favicon", "images/favicon.svg"].forEach(name =>
            assert.strictEqual(isFaviconFileName(name), false, name));
    });

    it("gives every picture format the viewer needs its own MIME type", function () {
        assert.deepStrictEqual(
            IMAGE_EXTENSIONS.map(ext => [ext, imageMimeType("a" + ext)]),
            [
                [".ico", "image/x-icon"],
                [".png", "image/png"],
                [".svg", "image/svg+xml"],
                [".jpg", "image/jpeg"],
                [".jpeg", "image/jpeg"],
                [".webp", "image/webp"],
                [".gif", "image/gif"]
            ]
        );
        assert.strictEqual(imageMimeType("notes.txt"), null);
    });
});

describe("Importing files into a project", function () {
    it("accepts only sound files, Ink scenes, YAML files and pictures", function () {
        ["a.mp3", "a.WAV", "a.ogg", "a.m4a", "a.flac", "a.opus", "scene.ink", "game.yaml", "x.YML", "favicon.ico", "brand.PNG", "mark.svg",
            "cover.jpg", "COVER.JPEG", "hero.webp", "anim.gif"].forEach(name => assert.ok(importKind(name), name));
        ["a.txt", "a.js", "a.exe", "a.zip", "a.pdf", "a", ".mp3x", "a.ink.bak"].forEach(name => assert.strictEqual(importKind(name), null, name));
        assert.strictEqual(importKind("a.png"), "image");
        assert.ok(IMPORT_EXTENSIONS.includes(".mp3") && IMPORT_EXTENSIONS.includes(".ink") && IMPORT_EXTENSIONS.includes(".yml") &&
            IMPORT_EXTENSIONS.includes(".ico") && IMPORT_EXTENSIONS.includes(".jpg") && IMPORT_EXTENSIONS.includes(".webp") && IMPORT_EXTENSIONS.includes(".gif"));
    });

    it("sends each kind of file to its folder and refuses everything else", function () {
        const root = temp("inky-import-root-"), source = temp("inky-import-src-");
        try {
            fs.mkdirSync(path.join(root, "scenes"));
            const files = ["music.mp3", "steps.WAV", "beach.ink", "style.yaml", "mark.png", "script.js", "no-extension"];
            files.forEach(name => fs.writeFileSync(path.join(source, name), "x"));
            fs.mkdirSync(path.join(source, "folder"));
            const plan = planImport(root, files.concat(["folder", "missing-file.mp3"]).map(name => path.join(source, name)), "scenes");

            assert.deepStrictEqual(plan.items.map(item => [item.name, item.destRel]).sort(), [
                ["beach.ink", "scenes/beach.ink"],
                ["mark.png", "image/mark.png"],
                ["music.mp3", "audio/music.mp3"],
                ["steps.WAV", "audio/steps.WAV"],
                ["style.yaml", "style.yaml"]
            ]);
            assert.deepStrictEqual(plan.rejected.map(item => item.name).sort(), ["folder", "missing-file.mp3", "no-extension", "script.js"]);

            const result = applyImport(plan, { replaceExisting: false });
            assert.strictEqual(result.imported.length, 5);
            ["audio/music.mp3", "audio/steps.WAV", "scenes/beach.ink", "style.yaml", "image/mark.png"].forEach(rel => assert.ok(fs.existsSync(path.join(root, rel)), rel));
            assert.ok(!fs.existsSync(path.join(root, "mark.png")) && !fs.existsSync(path.join(root, "script.js")));
        } finally {
            fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(source, { recursive: true, force: true });
        }
    });

    it("keeps one root favicon and confirms replacement across image formats", function () {
        const root = temp("inky-import-favicon-root-"), source = temp("inky-import-favicon-src-");
        try {
            fs.writeFileSync(path.join(root, "favicon.ico"), "old ico");
            fs.writeFileSync(path.join(source, "favicon.svg"), "new svg");
            let plan = planImport(root, [path.join(source, "favicon.svg")], "nested");
            assert.strictEqual(plan.items[0].destRel, "favicon.svg");
            assert.strictEqual(plan.items[0].isFavicon, true);
            assert.strictEqual(plan.items[0].exists, true);

            let result = applyImport(plan, { replaceExisting: false });
            assert.deepStrictEqual(result.skipped.map(item => item.destRel), ["favicon.svg"]);
            assert.strictEqual(fs.readFileSync(path.join(root, "favicon.ico"), "utf8"), "old ico");

            result = applyImport(plan, { replaceExisting: true });
            assert.deepStrictEqual(result.imported.map(item => item.destRel), ["favicon.svg"]);
            assert.strictEqual(fs.existsSync(path.join(root, "favicon.ico")), false);
            assert.strictEqual(fs.readFileSync(path.join(root, "favicon.svg"), "utf8"), "new svg");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(source, { recursive: true, force: true });
        }
    });

    it("imports several pictures at once into image, and never lets one replace the favicon", function () {
        const root = temp("inky-import-images-root-"), source = temp("inky-import-images-src-");
        try {
            fs.writeFileSync(path.join(root, "favicon.png"), "the real favicon");
            ["cover.jpg", "HERO.WEBP", "logo.svg", "anim.gif", "other.png"].forEach(name => fs.writeFileSync(path.join(source, name), "x"));

            const plan = planImport(root, ["cover.jpg", "HERO.WEBP", "logo.svg", "anim.gif", "other.png"].map(name => path.join(source, name)), "scenes");
            assert.deepStrictEqual(plan.items.map(item => item.destRel), [
                "image/cover.jpg", "image/HERO.WEBP", "image/logo.svg", "image/anim.gif", "image/other.png"
            ]);
            assert.ok(plan.items.every(item => item.isFavicon === false));

            const result = applyImport(plan, { replaceExisting: true });
            assert.strictEqual(result.imported.length, 5);
            assert.strictEqual(fs.readFileSync(path.join(root, "favicon.png"), "utf8"), "the real favicon", "the favicon is left alone");

            // an .ico, and anything called favicon.*, are the only pictures that reach the project root
            fs.writeFileSync(path.join(source, "seal.ico"), "ico bytes");
            fs.writeFileSync(path.join(source, "favicon.jpg"), "not a favicon format");
            const mixed = planImport(root, [path.join(source, "seal.ico"), path.join(source, "favicon.jpg")], "");
            assert.deepStrictEqual(mixed.items.map(item => [item.destRel, item.isFavicon]), [
                ["favicon.ico", true],
                ["image/favicon.jpg", false]
            ]);
            applyImport(mixed, { replaceExisting: true });
            assert.strictEqual(fs.existsSync(path.join(root, "image", "favicon.jpg")), true);

            // still only one favicon per import
            fs.writeFileSync(path.join(source, "another.ico"), "2");
            const two = planImport(root, [path.join(source, "seal.ico"), path.join(source, "another.ico")], "");
            assert.strictEqual(two.items.length, 1);
            assert.strictEqual(two.rejected[0].reason, "only one favicon image can be imported at a time");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(source, { recursive: true, force: true });
        }
    });

    it("flags a picture above the size limit, without refusing it", function () {
        const root = temp("inky-import-large-root-"), source = temp("inky-import-large-src-");
        try {
            const handle = fs.openSync(path.join(source, "grande.png"), "w");
            fs.ftruncateSync(handle, LARGE_IMAGE_BYTES + 1024);
            fs.closeSync(handle);
            fs.writeFileSync(path.join(source, "pequena.png"), "x");

            const plan = planImport(root, [path.join(source, "grande.png"), path.join(source, "pequena.png")], "");
            assert.strictEqual(plan.items.length, 2);
            assert.strictEqual(plan.items[0].largeImage, true);
            assert.strictEqual(plan.items[0].imageBytes, LARGE_IMAGE_BYTES + 1024);
            assert.strictEqual(plan.items[1].largeImage, false);
            assert.deepStrictEqual(applyImport(plan, { replaceExisting: false }).imported.map(item => item.destRel), [
                "image/grande.png", "image/pequena.png"
            ]);
            assert.strictEqual(fs.statSync(path.join(root, "image", "grande.png")).size, LARGE_IMAGE_BYTES + 1024, "the picture is copied unchanged");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(source, { recursive: true, force: true });
        }
    });

    it("asks before replacing, never writes outside the project and ignores repeated names", function () {
        const root = temp("inky-import-root-"), source = temp("inky-import-src-"), other = temp("inky-import-src2-");
        try {
            fs.mkdirSync(path.join(root, "audio"));
            fs.writeFileSync(path.join(root, "audio", "a.mp3"), "velho");
            fs.writeFileSync(path.join(source, "a.mp3"), "novo");
            fs.writeFileSync(path.join(other, "a.mp3"), "outro");
            fs.writeFileSync(path.join(source, "b.mp3"), "b");

            let plan = planImport(root, [path.join(source, "a.mp3"), path.join(other, "a.mp3"), path.join(source, "b.mp3")], "");
            assert.deepStrictEqual(plan.items.map(item => [item.name, item.exists]), [["a.mp3", true], ["b.mp3", false]]);
            assert.strictEqual(plan.rejected.length, 1);

            let result = applyImport(plan, { replaceExisting: false });
            assert.strictEqual(fs.readFileSync(path.join(root, "audio", "a.mp3"), "utf8"), "velho");
            assert.deepStrictEqual(result.skipped.map(item => item.name), ["a.mp3"]);
            assert.deepStrictEqual(result.imported.map(item => item.name), ["b.mp3"]);

            plan = planImport(root, [path.join(source, "a.mp3")], "");
            result = applyImport(plan, { replaceExisting: true });
            assert.strictEqual(fs.readFileSync(path.join(root, "audio", "a.mp3"), "utf8"), "novo");

            // a file that is already in the project folder is not "imported" onto itself
            assert.strictEqual(planImport(root, [path.join(root, "audio", "a.mp3")], "").rejected.length, 1);
            // a folder that leaves the project is refused
            fs.writeFileSync(path.join(source, "c.ink"), "c");
            const escape = planImport(root, [path.join(source, "c.ink")], "../fora");
            assert.strictEqual(escape.items.length, 0);
            assert.strictEqual(escape.rejected.length, 1);
        } finally {
            [root, source, other].forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
        }
    });
});
