const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseImageTag, parseBackgroundTag, collectImagesFromStory, resolveImageReference, listUsableImageFiles, rewriteImageReferences, imageTagKey } = require("../renderer/imageTags.js");

describe("image tag module entry points", function () {
    it("keeps the app-level module in sync with the renderer implementation", function () {
        const appLevel = require("../imageTags.js");
        const rendererLevel = require("../renderer/imageTags.js");
        assert.strictEqual(appLevel.resolveImageReference, rendererLevel.resolveImageReference);
        assert.strictEqual(appLevel.parseBackgroundTag, rendererLevel.parseBackgroundTag);
    });
});

describe("image tag", function () {
    it("recognises #image and #bg as distinct picture resources", function () {
        assert.deepStrictEqual(parseImageTag("image: hero.jpg"), { kind: "image", reference: "hero.jpg" });
        assert.deepStrictEqual(parseImageTag("# image: image/hero.jpg"), { kind: "image", reference: "image/hero.jpg" });
        assert.deepStrictEqual(parseImageTag("IMAGE: hero.jpg"), { kind: "image", reference: "hero.jpg" });
        assert.strictEqual(parseImageTag("music: dark.mp3"), null);
        assert.deepStrictEqual(parseBackgroundTag("bg: forest.jpg"), { kind: "background", reference: "forest.jpg" });
        assert.deepStrictEqual(parseBackgroundTag("# bg: image/night.webp"), { kind: "background", reference: "image/night.webp" });
        assert.strictEqual(parseBackgroundTag("BACKGROUND: forest.jpg"), null, "#bg is the only public background tag");
    });

    it("collects image and background references separately", function () {
        const story = { root: [
            ["#", "^image: hero.jpg", "/#"],
            ["#", "^IMAGE: scenes/room.png", "/#"],
            ["#", "^Image: hero.jpg", "/#"],
            ["#", "^bg: forest.jpg", "/#"],
            ["#", "^BG: scenes/night.webp", "/#"]
        ] };
        const found = collectImagesFromStory(story);
        assert.deepStrictEqual(found.files, ["forest.jpg", "hero.jpg", "scenes/night.webp", "scenes/room.png"]);
        assert.deepStrictEqual(found.references, [
            { kind: "background", reference: "forest.jpg" },
            { kind: "background", reference: "scenes/night.webp" },
            { kind: "image", reference: "hero.jpg" },
            { kind: "image", reference: "scenes/room.png" }
        ]);
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

    it("finds bare #image names in image/ and #bg names in image/background/", function () {
        write("image/hero.png");
        write("image/background/moon.png");
        const hero = resolveImageReference(root, "hero.png", "image");
        assert.strictEqual(hero.kind, "ok");
        assert.strictEqual(hero.relative, "image/hero.png");
        assert.strictEqual(hero.defaulted, true);
        assert.strictEqual(hero.source, path.join(root, "image", "hero.png"));
        const background = resolveImageReference(root, "moon.png", "background");
        assert.strictEqual(background.kind, "ok");
        assert.strictEqual(background.relative, "image/background/moon.png");
    });

    it("keeps explicit custom paths and nested category paths working", function () {
        write("custom/scenes/room.jpg");
        write("image/character/elara.png");
        write("image/background/seasonal/autumn.jpg");
        assert.strictEqual(resolveImageReference(root, "custom/scenes/room.jpg", "image").relative, "custom/scenes/room.jpg");
        assert.strictEqual(resolveImageReference(root, "./custom/scenes/room.jpg", "image").relative, "custom/scenes/room.jpg");
        write("image/custom/scenes/room.jpg");
        assert.strictEqual(resolveImageReference(root, "./custom/scenes/room.jpg", "image").relative, "custom/scenes/room.jpg");
        assert.strictEqual(resolveImageReference(root, "image/character/elara.png", "image").relative, "image/character/elara.png");
        assert.strictEqual(resolveImageReference(root, "image/background/seasonal/autumn.jpg", "background").relative, "image/background/seasonal/autumn.jpg");
        assert.strictEqual(resolveImageReference(root, "./custom/scenes/room.jpg", "image").relative, "custom/scenes/room.jpg");
    });

    it("reports ambiguous bare names instead of choosing one folder", function () {
        write("hero.png");
        write("image/hero.png");
        const result = resolveImageReference(root, "hero.png", "image");
        assert.strictEqual(result.kind, "ambiguous");
        assert.deepStrictEqual(result.candidates, ["hero.png", "image/hero.png"]);
    });

    it("keeps the old images/ folder as a read-only fallback", function () {
        write("images/legacy.png");
        const result = resolveImageReference(root, "legacy.png", "image");
        assert.strictEqual(result.kind, "ok");
        assert.strictEqual(result.relative, "images/legacy.png");
    });

    it("lists direct files by bare name and nested files by explicit path", function () {
        write("image/hero.png");
        write("image/character/elara.png");
        write("image/background/moon.webp");
        write("image/background/seasonal/autumn.jpg");
        write("images/old/legacy.png");
        write("scenes/room.png");
        write("notes.txt");
        write(".git/logo.png");
        fs.mkdirSync(path.join(root, "node_modules"));
        write("node_modules/stray.png");
        assert.deepStrictEqual(listUsableImageFiles(root, "image"), [
            "hero.png", "image/background/moon.webp", "image/background/seasonal/autumn.jpg",
            "image/character/elara.png", "images/old/legacy.png"
        ].sort((a, b) => a.localeCompare(b)));
        assert.deepStrictEqual(listUsableImageFiles(root, "background"), [
            "moon.webp", "image/background/seasonal/autumn.jpg"
        ].sort((a, b) => a.localeCompare(b)));
        assert.deepStrictEqual(listUsableImageFiles(null, "image"), []);
    });

    it("keeps reporting missing and invalid names, and never leaves the project", function () {
        write("image/hero.png");
        assert.strictEqual(resolveImageReference(root, "nothing.png", "image").kind, "missing");
        assert.strictEqual(resolveImageReference(root, "../hero.png", "image").kind, "invalid");
        assert.strictEqual(resolveImageReference(root, "/image/hero.png", "image").kind, "invalid");
        assert.strictEqual(resolveImageReference(root, "image/../../hero.png", "image").kind, "invalid");
        assert.strictEqual(resolveImageReference(root, "notes.txt", "image").kind, "invalid");
        assert.strictEqual(resolveImageReference(root, "https://example.com/a.png", "image").kind, "remote");
    });

    it("rewrites image and background references independently", function () {
        const story = { root: [
            ["#", "^image: forest.png", "/#"],
            ["#", "^bg: forest.png", "/#"],
            ["#", "^image: custom.png", "/#"]
        ] };
        rewriteImageReferences(story, new Map([
            [imageTagKey("image", "forest.png"), "image/forest.png"],
            [imageTagKey("background", "forest.png"), "image/background/forest.png"]
        ]));
        assert.deepStrictEqual(story.root, [
            ["#", "^image: image/forest.png", "/#"],
            ["#", "^bg: image/background/forest.png", "/#"],
            ["#", "^image: custom.png", "/#"]
        ]);
    });
});


describe("image symlink safety", function () {
    it("rejects links outside the project, including symlinked parent directories", function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-image-links-"));
        const project = path.join(root, "project");
        const external = path.join(root, "outside.png");
        try {
            fs.mkdirSync(path.join(project, "image"), { recursive: true });
            fs.writeFileSync(external, "not part of the project");
            fs.symlinkSync(external, path.join(project, "image", "outside.png"));
            fs.symlinkSync(root, path.join(project, "image", "other-folder"), "dir");
            assert.strictEqual(resolveImageReference(project, "outside.png", "image").kind, "missing");
            assert.strictEqual(resolveImageReference(project, "image/other-folder/outside.png", "image").kind, "missing");
            fs.writeFileSync(path.join(project, "image", "valid.png"), "valid");
            assert.strictEqual(resolveImageReference(project, "valid.png", "image").kind, "ok");
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });
});

describe("inert exported picture tags", function () {
    it("can blank invalid references without touching other tags or other picture kinds", function () {
        const story = {root: [
            ["#", "^image: absent.jpg", "/#"],
            ["#", "^bg: absent.jpg", "/#"],
            ["#", "^image: valid.jpg", "/#"]
        ]};
        rewriteImageReferences(story, new Map([
            [imageTagKey("image", "absent.jpg"), ""],
            [imageTagKey("background", "absent.jpg"), "image/background/absent.jpg"]
        ]));
        assert.deepStrictEqual(story.root, [
            ["#", "^image: ", "/#"],
            ["#", "^bg: image/background/absent.jpg", "/#"],
            ["#", "^image: valid.jpg", "/#"]
        ]);
    });
});
