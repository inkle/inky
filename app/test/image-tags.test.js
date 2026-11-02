const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseImageTag, collectImagesFromStory, resolveImageReference, listUsableImageFiles, rewriteImageReferences } = require("../renderer/imageTags.js");

describe("image tag", function () {
    it("is written \"# image:\" and still read in capitals", function () {
        assert.deepStrictEqual(parseImageTag("image: hero.jpg"), { reference: "hero.jpg" });
        assert.deepStrictEqual(parseImageTag("# image: images/hero.jpg"), { reference: "images/hero.jpg" });
        assert.deepStrictEqual(parseImageTag("IMAGE: hero.jpg"), { reference: "hero.jpg" });
        assert.strictEqual(parseImageTag("music: dark.mp3"), null);
    });

    it("collects pictures from the compiled story whichever way the tag is spelled", function () {
        const story = { root: [["#", "^image: hero.jpg", "/#"], ["#", "^IMAGE: scenes/room.png", "/#"], ["#", "^Image: hero.jpg", "/#"]] };
        assert.deepStrictEqual(collectImagesFromStory(story).files, ["hero.jpg", "scenes/room.png"]);
    });
});

describe("image folders by default", function () {
    let root;
    const write = (relative, text) => {
        const file = path.join(root, ...relative.split("/"));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text || relative);
    };

    beforeEach(function () { root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-image-folders-")); });
    afterEach(function () { fs.rmSync(root, { recursive: true, force: true }); });

    it("finds a bare name in images/, then in image/", function () {
        write("images/hero.png");
        write("image/moon.png");
        const hero = resolveImageReference(root, "hero.png");
        assert.strictEqual(hero.kind, "ok");
        assert.strictEqual(hero.relative, "images/hero.png");
        assert.strictEqual(hero.defaulted, true);
        assert.strictEqual(hero.source, path.join(root, "images", "hero.png"));
        assert.strictEqual(resolveImageReference(root, "moon.png").relative, "image/moon.png");
    });

    it("finds a name with subfolders inside those folders", function () {
        write("images/chapter1/room.jpg");
        assert.strictEqual(resolveImageReference(root, "chapter1/room.jpg").relative, "images/chapter1/room.jpg");
    });

    it("looks at the written path first, then images/, then image/", function () {
        write("hero.png"); write("images/hero.png"); write("image/hero.png");
        assert.strictEqual(resolveImageReference(root, "hero.png").relative, "hero.png");
        assert.strictEqual(resolveImageReference(root, "hero.png").defaulted, false);
        fs.rmSync(path.join(root, "hero.png"));
        assert.strictEqual(resolveImageReference(root, "hero.png").relative, "images/hero.png");
        fs.rmSync(path.join(root, "images", "hero.png"));
        assert.strictEqual(resolveImageReference(root, "hero.png").relative, "image/hero.png");
    });

    it("still takes the full path, and the old spelling with the folder", function () {
        write("images/hero.png"); write("scenes/room.png");
        const full = resolveImageReference(root, "images/hero.png");
        assert.deepStrictEqual([full.kind, full.relative, full.defaulted], ["ok", "images/hero.png", false]);
        assert.strictEqual(resolveImageReference(root, "scenes/room.png").relative, "scenes/room.png");
    });

    it("lists only the pictures inside images/ and image/, by the name the tag finds them", function () {
        write("cover.jpg");
        write("images/hero.png");
        write("images/chapter1/room.jpg");
        write("image/moon.webp");
        write("scenes/room.png");
        write("assets/images/deep.gif");
        write("notes.txt");
        write(".git/logo.png");
        fs.mkdirSync(path.join(root, "node_modules"));
        write("node_modules/stray.png");
        const files = listUsableImageFiles(root);
        assert.deepStrictEqual(files, ["chapter1/room.jpg", "hero.png", "moon.webp"]);
        ["cover.jpg", "scenes/room.png", "assets/images/deep.gif"].forEach(name => assert.ok(!files.includes(name), name + " is outside the picture folders"));
        assert.ok(!files.some(name => /logo|stray/.test(name)));
        files.forEach(name => assert.strictEqual(resolveImageReference(root, name).kind, "ok", name));
        assert.deepStrictEqual(listUsableImageFiles(null), []);
    });

    it("keeps reporting missing and invalid names, and never leaves the project", function () {
        write("images/hero.png");
        assert.strictEqual(resolveImageReference(root, "nothing.png").kind, "missing");
        assert.strictEqual(resolveImageReference(root, "../hero.png").kind, "invalid");
        assert.strictEqual(resolveImageReference(root, "/images/hero.png").kind, "invalid");
        assert.strictEqual(resolveImageReference(root, "images/../../hero.png").kind, "invalid");
        assert.strictEqual(resolveImageReference(root, "notes.txt").kind, "invalid");
        assert.strictEqual(resolveImageReference(root, "https://example.com/a.png").kind, "remote");
    });

    it("rewrites only the tags it is told to, whatever the spelling, in both compiled forms", function () {
        const story = { root: [
            ["#", "^image: hero.png", "/#"],
            ["#", "^IMAGE: hero.png", "/#"],
            ["#", "^image: ", "^hero.png", "/#"],
            ["#", "^image: other.png", "/#"],
            { "#": "image: hero.png" },
            ["#", "^music: hero.png", "/#"]
        ] };
        rewriteImageReferences(story, new Map([["hero.png", "images/hero.png"]]));
        assert.deepStrictEqual(story.root, [
            ["#", "^image: images/hero.png", "/#"],
            ["#", "^IMAGE: images/hero.png", "/#"],
            ["#", "^image: images/hero.png", "^", "/#"],
            ["#", "^image: other.png", "/#"],
            { "#": "image: images/hero.png" },
            ["#", "^music: hero.png", "/#"]
        ]);
    });
});
