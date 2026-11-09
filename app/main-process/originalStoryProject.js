"use strict";
// Keep the four full stories inherited from the original Inky unmodified when
// opening them. Unlike a short Ink snippet, each is a self-contained project:
// inserting one into the startup story would corrupt both stories.
const fs = require("fs");
const path = require("path");

const STORIES = Object.freeze({
    "crime-scene":   { title: "Crime Scene",   file: "murder_scene.ink" },
    "swindlestones": { title: "Swindlestones", file: "swindlestones.ink" },
    "pontoon-game":  { title: "Pontoon Game",  file: "pontoon_example.ink" },
    "the-intercept": { title: "The Intercept", file: "theintercept.ink" }
});

function originalFile(name) {
    const candidates = [
        path.join(__dirname, "../../app.asar.unpacked/main-process/ink/longer-ink-snippets", name),
        path.join(__dirname, "ink/longer-ink-snippets", name)
    ];
    for (const file of candidates) {
        try { if (fs.statSync(file).isFile()) return file; }
        catch (_) { /* Try the development path. */ }
    }
    throw new Error("Original Ink story file missing: " + name);
}

// Adapt legacy presentation only in the independent, user-editable copies.
// The bundled originals remain intact as historical examples.
// The shared InkRichText reader renders these safe markers in both Preview
// and Web Export: ⟦b⟧…⟦/b⟧, ⟦i⟧…⟦/i⟧ and ⟦br⟧.
function adaptOriginalMarkup(source) {
    return source
        .replace(/<(\/?)((?:i|b))>/gi, (_, slash, tag) => "⟦" + slash + tag.toLowerCase() + "⟧")
        .replace(/<br\s*\/?>/gi, "⟦br⟧")
        // Pontoon Game marks spoken internal thoughts as Ink metadata.
        // The reader has no #thought display feature and would otherwise
        // print '# thought' below the dialogue. Keep the dialogue verbatim.
        .replace(/[ \t]+#\s*thought[ \t]*(?=\r?$)/gmi, "");
}

function createOriginalStoryProject(parent, id) {
    if (!Object.prototype.hasOwnProperty.call(STORIES, id)) throw new Error("Unknown original story: " + id);
    const story = STORIES[id];
    const source = originalFile(story.file);
    fs.mkdirSync(parent, { recursive: true });
    let directory;
    for (let copy = 1; ; copy++) {
        directory = path.join(parent, story.title + (copy === 1 ? "" : " (" + copy + ")"));
        try { fs.mkdirSync(directory); break; }
        catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    try {
        const entry = path.join(directory, story.title + ".ink");
        fs.writeFileSync(entry, adaptOriginalMarkup(fs.readFileSync(source, "utf8")), { flag: "wx" });
        // Original examples rely on regular, flowing Ink passages. Inky's
        // modern Screen Mode and Before Dawn visuals are deliberately not used.
        const settings = "presentation: traditional\n" +
            "titles:\n  story: " + JSON.stringify(story.title) + "\n" +
            // Long original title needs a smaller size in the fixed-width Title Screen.
            (id === "swindlestones" ? "  story_size_px: 44\n" : "");
        fs.writeFileSync(path.join(directory, "game.yaml"), settings, { flag: "wx" });
        return entry;
    } catch (error) {
        fs.rmSync(directory, { recursive: true, force: true });
        throw error;
    }
}

module.exports = { STORIES, createOriginalStoryProject, originalFile, adaptOriginalMarkup };
