const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildWebExport } = require("../renderer/webExporter.js");
const { collectImagesFromStory } = require("../renderer/imageTags.js");

const TEMPLATE = path.join(__dirname, "../export-for-web-template");

async function exportStory(root, story, options) {
    const compiledJsonPath = path.join(root, "compiled.json");
    const inkRuntimePath = path.join(root, "ink.js");
    fs.writeFileSync(compiledJsonPath, JSON.stringify(story));
    fs.writeFileSync(inkRuntimePath, "ink runtime");
    return buildWebExport(Object.assign({
        compiledJsonPath,
        targetDirectory: path.join(root, "web"),
        templateDirectory: TEMPLATE,
        inkRuntimePath
    }, options || {}));
}

function exportedStory(targetDirectory) {
    return JSON.parse(fs.readFileSync(path.join(targetDirectory, "story.js"), "utf8")
        .replace(/^var storyContent = |;\s*$/g, ""));
}

describe("web export pictures", function () {
    it("copies pictures at the project root and in subfolders, keeping the paths the story uses", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-images-"));
        const projectDirectory = path.join(root, "project");
        const story = {
            inkVersion: 21,
            root: [
                ["#", "^image: hero.jpg", "/#"],
                ["#", "^image: scenes/room.png", "/#"],
                ["#", "^image: scenes/room.png", "/#"],
                ["#", "^image: scenes/other.webp", "/#"]
            ]
        };

        try {
            fs.mkdirSync(path.join(projectDirectory, "scenes"), { recursive: true });
            fs.writeFileSync(path.join(projectDirectory, "hero.jpg"), "root picture");
            fs.writeFileSync(path.join(projectDirectory, "scenes", "room.png"), "room picture");
            fs.writeFileSync(path.join(projectDirectory, "scenes", "other.webp"), "other picture");

            const result = await exportStory(root, story, { projectDirectory });

            assert.deepStrictEqual(result.images, {
                copied: ["hero.jpg", "scenes/other.webp", "scenes/room.png"],
                missing: [],
                invalid: []
            });
            const expected = {
                "hero.jpg": "root picture",
                "scenes/room.png": "room picture",
                "scenes/other.webp": "other picture"
            };
            for (const relative of Object.keys(expected)) {
                assert.strictEqual(fs.readFileSync(path.join(result.targetDirectory, relative), "utf8"), expected[relative]);
                assert.ok(result.files.includes(relative), relative + " should be listed in the bundle");
            }

            // The story keeps its own references, and each one resolves next to index.html.
            const exported = exportedStory(result.targetDirectory);
            assert.deepStrictEqual(exported, story);
            const references = collectImagesFromStory(exported).files;
            assert.deepStrictEqual(references, Object.keys(expected).sort());
            for (const reference of references) {
                const file = path.join(result.targetDirectory, reference.split("/").join(path.sep));
                assert.ok(fs.statSync(file).isFile(), reference + " should load from the exported folder");
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("exports a picture named without its folder from images/ or image/ and points the tag at it", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-images-default-"));
        const projectDirectory = path.join(root, "project");
        const story = {
            inkVersion: 21,
            root: [
                ["#", "^image: hero.png", "/#"],
                ["#", "^IMAGE: moon.png", "/#"],
                ["#", "^image: chapter1/room.jpg", "/#"],
                ["#", "^image: images/old.png", "/#"],
                ["#", "^image: cover.jpg", "/#"],
                ["#", "^image: nothing.png", "/#"]
            ]
        };

        try {
            const put = (relative, text) => {
                const file = path.join(projectDirectory, ...relative.split("/"));
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, text);
            };
            put("images/hero.png", "hero in images");
            put("image/moon.png", "moon in image");
            put("images/chapter1/room.jpg", "room in images");
            put("images/old.png", "old spelling");
            put("cover.jpg", "root picture");
            put("images/cover.jpg", "must lose to the root picture");

            const result = await exportStory(root, story, { projectDirectory });

            assert.deepStrictEqual(result.images.missing, ["nothing.png"]);
            assert.deepStrictEqual(result.images.invalid, []);
            const expected = {
                "images/hero.png": "hero in images",
                "image/moon.png": "moon in image",
                "images/chapter1/room.jpg": "room in images",
                "images/old.png": "old spelling",
                "cover.jpg": "root picture"
            };
            for (const relative of Object.keys(expected)) {
                assert.strictEqual(fs.readFileSync(path.join(result.targetDirectory, relative.split("/").join(path.sep)), "utf8"), expected[relative]);
                assert.ok(result.files.includes(relative), relative + " should be listed in the bundle");
            }

            // Each tag now names the file as the exported page loads it; the rest is untouched.
            const exported = exportedStory(result.targetDirectory);
            assert.deepStrictEqual(exported.root, [
                ["#", "^image: images/hero.png", "/#"],
                ["#", "^IMAGE: image/moon.png", "/#"],
                ["#", "^image: images/chapter1/room.jpg", "/#"],
                ["#", "^image: images/old.png", "/#"],
                ["#", "^image: cover.jpg", "/#"],
                ["#", "^image: nothing.png", "/#"]
            ]);
            collectImagesFromStory(exported).files.filter(reference => reference !== "nothing.png").forEach(reference => {
                assert.ok(fs.statSync(path.join(result.targetDirectory, reference.split("/").join(path.sep))).isFile(), reference);
            });
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("reports missing and invalid pictures and never copies files from outside the project", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-images-invalid-"));
        const projectDirectory = path.join(root, "project");
        const outsidePath = path.join(root, "outside.png");
        const absolutePath = path.join(projectDirectory, "absolute.png");
        const story = {
            inkVersion: 21,
            root: [
                ["#", "^image: images/missing.png", "/#"],
                ["#", "^image: ../outside.png", "/#"],
                ["#", "^image: " + absolutePath, "/#"],
                ["#", "^image: notes.txt", "/#"],
                ["#", "^image: https://example.com/remote.png", "/#"]
            ]
        };

        try {
            fs.mkdirSync(projectDirectory, { recursive: true });
            fs.writeFileSync(outsidePath, "outside picture");
            fs.writeFileSync(absolutePath, "absolute picture");
            fs.writeFileSync(path.join(projectDirectory, "notes.txt"), "not a picture");

            const result = await exportStory(root, story, { projectDirectory });

            assert.deepStrictEqual(result.images.missing, ["images/missing.png"]);
            assert.strictEqual(result.images.invalid.length, 3);
            assert.ok(result.images.invalid.includes("../outside.png"));
            assert.ok(result.images.invalid.includes(absolutePath));
            assert.ok(result.images.invalid.includes("notes.txt"));
            assert.deepStrictEqual(result.images.copied, []);
            for (const name of ["outside.png", "absolute.png", "notes.txt", "remote.png"]) {
                assert.strictEqual(fs.existsSync(path.join(result.targetDirectory, name)), false, name + " should not be copied");
            }
            assert.ok(!result.files.some(file => /outside|absolute|notes|remote/.test(file)));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("keeps cover, favicon and audio exports while adding the story pictures", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-images-existing-"));
        const projectDirectory = path.join(root, "project");
        const story = {
            inkVersion: 21,
            root: [
                ["#", "^image: images/scene.jpg", "/#"],
                ["#", "^IMAGE: cover.jpg", "/#"],
                ["#", "^music: theme.mp3", "/#"]
            ]
        };

        try {
            fs.mkdirSync(path.join(projectDirectory, "images"), { recursive: true });
            fs.mkdirSync(path.join(projectDirectory, "audio"), { recursive: true });
            fs.writeFileSync(path.join(projectDirectory, "cover.jpg"), "cover picture");
            fs.writeFileSync(path.join(projectDirectory, "favicon.png"), "favicon picture");
            fs.writeFileSync(path.join(projectDirectory, "audio", "theme.mp3"), "music file");
            fs.writeFileSync(path.join(projectDirectory, "images", "scene.jpg"), "scene picture");

            const result = await exportStory(root, story, {
                projectDirectory,
                coverFilePath: path.join(projectDirectory, "cover.jpg"),
                faviconFilePath: path.join(projectDirectory, "favicon.png")
            });

            assert.strictEqual(fs.readFileSync(path.join(result.targetDirectory, "cover.jpg"), "utf8"), "cover picture");
            assert.strictEqual(fs.readFileSync(path.join(result.targetDirectory, "favicon.png"), "utf8"), "favicon picture");
            assert.strictEqual(fs.readFileSync(path.join(result.targetDirectory, "audio", "theme.mp3"), "utf8"), "music file");
            assert.strictEqual(fs.readFileSync(path.join(result.targetDirectory, "images", "scene.jpg"), "utf8"), "scene picture");
            assert.match(fs.readFileSync(path.join(result.targetDirectory, "index.html"), "utf8"), /<link rel="icon" href="favicon\.png" type="image\/png">/);
            assert.ok(result.audio.copied.includes("theme.mp3"));
            assert.ok(result.images.copied.includes("images/scene.jpg"));
            // A story picture may be the cover itself: it is not copied twice.
            assert.ok(result.images.copied.includes("cover.jpg"));
            assert.strictEqual(result.files.filter(file => file === "cover.jpg").length, 1);
            assert.deepStrictEqual(result.images.missing, []);
            assert.deepStrictEqual(result.images.invalid, []);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
