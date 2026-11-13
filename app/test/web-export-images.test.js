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

describe("web export #bg runtime", function () {
    it("applies the background to the frame and clears it with the scene", function () {
        const runtime = fs.readFileSync(path.join(TEMPLATE, "main.js"), "utf8");
        const css = fs.readFileSync(path.join(TEMPLATE, "style.css"), "utf8");
        assert.match(runtime, /splitTag\.property == "BG"/);
        assert.match(runtime, /storyFrame\.style\.backgroundImage = "url\("/);
        assert.match(runtime, /function clearStoryBackground\(\) \{[\s\S]*?backgroundImage = "";[\s\S]*?classList\.remove\("has-background"\)/);
        assert.match(runtime, /function clearScene\(\) \{[\s\S]*?clearStoryBackground\(\);/);
        assert.match(css, /\.container\.has-background \.story-visual \{\s*background: transparent;/);
        assert.match(css, /\.container\.has-background \.story-choices \{\s*background: transparent;/);
    });
});

describe("web export pictures", function () {
    it("copies pictures at the project root and in subfolders, keeping the paths the story uses", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-images-"));
        const projectDirectory = path.join(root, "project");
        const story = {
            inkVersion: 21,
            root: [
                ["#", "^image: hero.jpg", "/#"],
                ["#", "^image: scenes/room.png", "/#"],
                ["#", "^bg: scenes/background.jpg", "/#"],
                ["#", "^image: scenes/room.png", "/#"],
                ["#", "^image: scenes/other.webp", "/#"]
            ]
        };

        try {
            fs.mkdirSync(path.join(projectDirectory, "scenes"), { recursive: true });
            fs.writeFileSync(path.join(projectDirectory, "hero.jpg"), "root picture");
            fs.writeFileSync(path.join(projectDirectory, "scenes", "room.png"), "room picture");
            fs.writeFileSync(path.join(projectDirectory, "scenes", "background.jpg"), "background picture");
            fs.writeFileSync(path.join(projectDirectory, "scenes", "other.webp"), "other picture");

            const result = await exportStory(root, story, { projectDirectory });

            assert.deepStrictEqual(result.images, {
                copied: ["hero.jpg", "scenes/background.jpg", "scenes/other.webp", "scenes/room.png"],
                missing: [],
                ambiguous: [],
                invalid: []
            });
            const expected = {
                "hero.jpg": "root picture",
                "scenes/background.jpg": "background picture",
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
            ["#", "^bg: chapter1/background.jpg", "/#"],
                ["#", "^image: images/old.png", "/#"],
                ["#", "^image: ./cover.jpg", "/#"],
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
            put("images/chapter1/background.jpg", "background in images");
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
                "images/chapter1/background.jpg": "background in images",
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
                ["#", "^bg: images/chapter1/background.jpg", "/#"],
                ["#", "^image: images/old.png", "/#"],
                ["#", "^image: ./cover.jpg", "/#"],
                ["#", "^image: ", "/#"]
            ]);
            collectImagesFromStory(exported).files.forEach(reference => {
                assert.ok(fs.statSync(path.join(result.targetDirectory, reference.split("/").join(path.sep))).isFile(), reference);
            });
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });


    it("exports the conventional image and audio directories without flattening their categories", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-web-resource-folders-"));
        const projectDirectory = path.join(root, "project");
        const story = {
            inkVersion: 21,
            root: [
                ["#", "^bg: forest.jpg", "/#"],
                ["#", "^image: castle.png", "/#"],
                ["#", "^music: theme.mp3", "/#"],
                ["#", "^sound: thunder.wav", "/#"]
            ]
        };
        try {
            const put = (relative, data) => {
                const file = path.join(projectDirectory, ...relative.split("/"));
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, data);
            };
            put("image/background/forest.jpg", "forest background");
            put("image/castle.png", "scene image");
            put("audio/music/theme.mp3", "music track");
            put("audio/sfx/thunder.wav", "sound effect");

            const result = await exportStory(root, story, { projectDirectory });
            assert.deepStrictEqual(result.images, {
                copied: ["castle.png", "forest.jpg"], missing: [], ambiguous: [], invalid: []
            });
            assert.deepStrictEqual(result.audio, {
                copied: ["theme.mp3", "thunder.wav"], missing: [], ambiguous: [], invalid: []
            });
            const expectedFiles = [
                "image/background/forest.jpg", "image/castle.png",
                "audio/music/theme.mp3", "audio/sfx/thunder.wav"
            ];
            expectedFiles.forEach(relative => assert.ok(result.files.includes(relative), relative));

            const exported = exportedStory(result.targetDirectory);
            assert.deepStrictEqual(exported.root, [
                ["#", "^bg: image/background/forest.jpg", "/#"],
                ["#", "^image: image/castle.png", "/#"],
                ["#", "^music: music/theme.mp3", "/#"],
                ["#", "^sound: sfx/thunder.wav", "/#"]
            ]);
            expectedFiles.forEach(relative => {
                assert.ok(fs.statSync(path.join(result.targetDirectory, ...relative.split("/"))).isFile(), relative);
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
                ["#", "^bg: backgrounds/missing.png", "/#"],
                ["#", "^image: ../outside.png", "/#"],
                ["#", "^bg: ../outside-bg.png", "/#"],
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

            assert.deepStrictEqual(result.images.missing, ["backgrounds/missing.png", "images/missing.png"]);
            assert.strictEqual(result.images.invalid.length, 4);
            assert.ok(result.images.invalid.includes("../outside.png"));
            assert.ok(result.images.invalid.includes("../outside-bg.png"));
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


describe("picture parity: missing images, repeated backgrounds and order", function () {
    it("keeps the first valid image at the top and the last valid background after missing tags", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-picture-parity-"));
        const projectDirectory = path.join(root, "project");
        const story = { inkVersion: 21, root: [
            ["#", "^image: ghost.jpg", "/#"],
            ["#", "^image: valid.png", "/#"],
            ["#", "^image: second.png", "/#"],
            ["#", "^bg: forest.jpg", "/#"],
            ["#", "^bg: missing.jpg", "/#"],
            ["#", "^title: The Forest", "/#"]
        ]};
        try {
            fs.mkdirSync(path.join(projectDirectory, "image", "background"), { recursive: true });
            fs.writeFileSync(path.join(projectDirectory, "image", "valid.png"), "first");
            fs.writeFileSync(path.join(projectDirectory, "image", "second.png"), "second");
            fs.writeFileSync(path.join(projectDirectory, "image", "background", "forest.jpg"), "bg");
            const result = await exportStory(root, story, { projectDirectory });
            assert.deepStrictEqual(result.images.missing, ["ghost.jpg", "missing.jpg"]);
            assert.deepStrictEqual(result.images.copied, ["forest.jpg", "second.png", "valid.png"]);
            const exported = exportedStory(result.targetDirectory);
            const tags = exported.root.map(t => t[1]);
            assert.deepStrictEqual(tags, [
                "^image: ", "^image: image/valid.png", "^image: image/second.png",
                "^bg: image/background/forest.jpg", "^bg: ", "^title: The Forest"
            ]);
            const runtime = fs.readFileSync(path.join(TEMPLATE, "main.js"), "utf8");
            const placeTitle = runtime.indexOf("if( sceneTitle !== null ) {", runtime.indexOf("var pendingImages = [];"));
            const placeImages = runtime.indexOf("function appendPendingImages()", placeTitle);
            const placeParagraph = runtime.indexOf("storyContainer.appendChild(paragraphElement);", placeImages);
            const appendAfterParagraph = runtime.indexOf("appendPendingImages();", placeParagraph);
            assert.ok(placeTitle > 0 && placeImages > placeTitle && placeParagraph > placeImages
                && appendAfterParagraph > placeParagraph,
                "title must precede paragraph; inline images follow its paragraph");
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });

    it("does not export a symlink whose target is outside the project", async function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-picture-link-export-"));
        const projectDirectory = path.join(root, "project");
        const outside = path.join(root, "external.png");
        try {
            fs.mkdirSync(path.join(projectDirectory, "image"), { recursive: true });
            fs.writeFileSync(outside, "do not export");
            fs.symlinkSync(outside, path.join(projectDirectory, "image", "external.png"));
            const story = { inkVersion: 21, root: [["#", "^image: external.png", "/#"]] };
            const result = await exportStory(root, story, { projectDirectory });
            assert.deepStrictEqual(result.images.missing, ["external.png"]);
            assert.deepStrictEqual(result.images.copied, []);
            assert.strictEqual(exportedStory(result.targetDirectory).root[0][1], "^image: ");
            assert.ok(!fs.existsSync(path.join(result.targetDirectory, "image", "external.png")));
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });

    it("does not expose media tags beside choice labels in either player", function () {
        const exported = fs.readFileSync(path.join(TEMPLATE, "main.js"), "utf8");
        const preview = fs.readFileSync(path.join(__dirname, "../renderer/playerView.js"), "utf8");
        assert.match(exported, /splitTag\.property == "IMAGE" \|\| splitTag\.property == "BG"/);
        assert.match(preview, /imageFromTag\(tag\) === null && backgroundFromTag\(tag\) === null/);
    });
});
