const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { bundledExamplePath, writableExamplePath } = require("../main-process/exampleProject.js");

describe("bundled example project", function () {
    it("finds Glass Tide beside app.asar in a package", function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-example-packaged-"));
        try {
            const story = path.join(root, "resources", "mare-de-vidro", "short", "story.ink");
            fs.mkdirSync(path.dirname(story), { recursive: true });
            fs.writeFileSync(story, "-> start");

            assert.strictEqual(
                bundledExamplePath(path.join(root, "resources"), path.join(root, "app")),
                path.resolve(story)
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("finds the examples folder when running from source", function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-example-source-"));
        try {
            const story = path.join(root, "examples", "mare-de-vidro", "short", "story.ink");
            fs.mkdirSync(path.dirname(story), { recursive: true });
            fs.writeFileSync(story, "-> start");

            assert.strictEqual(
                bundledExamplePath(path.join(root, "resources"), path.join(root, "app")),
                path.resolve(story)
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("returns null when the sample is missing", function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-example-missing-"));
        try {
            assert.strictEqual(
                bundledExamplePath(path.join(root, "resources"), path.join(root, "app")),
                null
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("ships the Glass Tide story in this repository", function () {
        const story = bundledExamplePath(path.join(__dirname, "no-such-resources"), path.join(__dirname, ".."));
        assert.strictEqual(
            story,
            path.join(__dirname, "..", "..", "examples", "mare-de-vidro", "short", "story.ink")
        );
        const text = fs.readFileSync(story, "utf8");
        assert.match(text, /#title: /);
        assert.doesNotMatch(text, /#\s*(music|sound|image)\b/i);
    });
    describe("writable copy for installed packages", function () {
        let root;
        let resources;
        let dest;
        let story;

        beforeEach(function () {
            root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-example-copy-"));
            resources = path.join(root, "resources");
            dest = path.join(root, "home", "Inky", "mare-de-vidro");
            story = path.join(resources, "mare-de-vidro", "short", "story.ink");
            fs.mkdirSync(path.dirname(story), { recursive: true });
            fs.mkdirSync(path.join(resources, "mare-de-vidro", "long"), { recursive: true });
            fs.writeFileSync(story, "-> start");
            fs.writeFileSync(path.join(resources, "mare-de-vidro", "short", "game.yaml"), "title: x");
            fs.writeFileSync(path.join(resources, "mare-de-vidro", "long", "story.ink"), "-> long");
        });

        afterEach(function () {
            fs.chmodSync(path.join(resources, "mare-de-vidro", "short"), 0o755);
            fs.rmSync(root, { recursive: true, force: true });
        });

        it("opens the original when its folder is writable (running from source)", function () {
            assert.strictEqual(writableExamplePath(resources, path.join(root, "app"), dest), path.resolve(story));
            assert.strictEqual(fs.existsSync(dest), false);
        });

        it("copies the whole sample once and opens the copy when the folder is read-only", function () {
            if( process.getuid && process.getuid() === 0 ) this.skip();   // root ignores permissions
            fs.chmodSync(path.join(resources, "mare-de-vidro", "short"), 0o555);

            const opened = writableExamplePath(resources, path.join(root, "app"), dest);
            assert.strictEqual(opened, path.join(dest, "short", "story.ink"));
            assert.strictEqual(fs.readFileSync(opened, "utf8"), "-> start");
            assert.ok(fs.existsSync(path.join(dest, "short", "game.yaml")));
            assert.ok(fs.existsSync(path.join(dest, "long", "story.ink")));
            // The copy accepts new folders and files.
            fs.mkdirSync(path.join(dest, "short", "test"));
            fs.writeFileSync(path.join(dest, "short", "test", "a.ink"), "x");
        });

        it("never overwrites the writer's changes in an existing copy", function () {
            if( process.getuid && process.getuid() === 0 ) this.skip();
            fs.chmodSync(path.join(resources, "mare-de-vidro", "short"), 0o555);
            const opened = writableExamplePath(resources, path.join(root, "app"), dest);
            fs.writeFileSync(opened, "-> my own edit");
            assert.strictEqual(writableExamplePath(resources, path.join(root, "app"), dest), opened);
            assert.strictEqual(fs.readFileSync(opened, "utf8"), "-> my own edit");
        });

        it("falls back to the read-only original when the copy cannot be made", function () {
            if( process.getuid && process.getuid() === 0 ) this.skip();
            fs.chmodSync(path.join(resources, "mare-de-vidro", "short"), 0o555);
            const blocked = path.join(root, "blocked");
            fs.writeFileSync(blocked, "a file, not a folder");
            assert.strictEqual(writableExamplePath(resources, path.join(root, "app"), path.join(blocked, "x")), path.resolve(story));
        });

        it("returns null when there is no sample", function () {
            assert.strictEqual(writableExamplePath(path.join(root, "none"), path.join(root, "app"), dest), null);
        });
    });
});
