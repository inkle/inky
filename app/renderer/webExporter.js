"use strict";

// Restore Inky's web export helper. inkProject.js imports this module while the
// renderer starts, so this file must exist even when the writer never exports.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { collectAudioFromStory, resolveAudioFile, parseAudioTag, AUDIO_FOLDER, AUDIO_FOLDERS } = require("./audioTags.js");
const { collectImagesFromStory, resolveImageReference, rewriteImageReferences } = require("./imageTags.js");
const { FAVICON_EXTENSIONS, COVER_EXTENSIONS, imageMimeType } = require("./imageTypes.js");
const { TitleScreen } = require("./titleScreen.js");

function rewriteAudioTag(text, references) {
    const tag = parseAudioTag(text);
    if( !tag || !tag.file || !references.has(tag.file) ) return text;
    return String(text).replace(/^(\s*#?\s*(?:music|sound)\s*:\s*)(.*?)(\s*)$/i,
        (_, prefix, value, suffix) => prefix + references.get(tag.file) + suffix);
}

function rewriteAudioReferences(story, references) {
    const visit = node => {
        if( Array.isArray(node) ) {
            let tagTextIndexes = null;
            for( let index = 0; index < node.length; index++ ) {
                const item = node[index];
                if( item === "#" ) { tagTextIndexes = []; continue; }
                if( item === "/#" ) {
                    if( tagTextIndexes && tagTextIndexes.length ) {
                        const tagText = tagTextIndexes.map(tagIndex => node[tagIndex].slice(1)).join("");
                        const rewritten = rewriteAudioTag(tagText, references);
                        if( rewritten !== tagText ) {
                            tagTextIndexes.forEach((tagIndex, part) => { node[tagIndex] = part === 0 ? "^" + rewritten : "^"; });
                        }
                    }
                    tagTextIndexes = null;
                    continue;
                }
                if( tagTextIndexes && typeof item === "string" && item.charAt(0) === "^" ) {
                    tagTextIndexes.push(index);
                    continue;
                }
                visit(item);
            }
            return;
        }
        if( node && typeof node === "object" ) {
            if( typeof node["#"] === "string" ) node["#"] = rewriteAudioTag(node["#"], references);
            Object.keys(node).forEach(key => visit(node[key]));
        }
    };
    visit(story);
}

function exportedAudioPath(projectRoot, source, reference) {
    let relative = reference;
    if( path.isAbsolute(reference) || /[\\/]/.test(reference) ) {
        relative = path.relative(projectRoot, source);
        const segments = relative.split(path.sep);
        if( AUDIO_FOLDERS.concat(["music", "musics", "sfx"]).indexOf(String(segments[0]).toLowerCase()) !== -1 )
            segments.shift();
        relative = segments.join(path.sep);
    }
    const normalized = path.normalize(relative);
    if( !normalized || normalized === "." || path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(".." + path.sep) ) {
        const digest = crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);
        relative = path.join("__external", digest + "-" + path.basename(source));
    } else {
        relative = normalized;
    }
    return relative.split(path.sep).join("/");
}

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function safeJavascriptFilename(value) {
    let filename = path.basename(String(value || "story.js"));
    if (!filename || filename === "." || filename === "..") filename = "story.js";
    if (path.extname(filename).toLowerCase() !== ".js") {
        filename = path.basename(filename, path.extname(filename)) + ".js";
    }
    // The web template has a separate main.js. Keep story content distinct so
    // a project called main.ink cannot overwrite the player logic.
    if (filename.toLowerCase() === "main.js") filename = "story.js";
    return filename;
}

async function buildWebExport(options) {
    options = options || {};
    const required = ["compiledJsonPath", "targetDirectory", "templateDirectory", "inkRuntimePath"];
    required.forEach(key => {
        if (!options[key] || typeof options[key] !== "string") {
            throw new Error("Missing required web export option: " + key);
        }
    });

    const compiledJsonPath = path.resolve(options.compiledJsonPath);
    const targetDirectory = path.resolve(options.targetDirectory);
    const templateDirectory = path.resolve(options.templateDirectory);
    const inkRuntimePath = path.resolve(options.inkRuntimePath);
    const jsFilename = safeJavascriptFilename(options.javascriptFilename);
    const storyTitle = String(options.storyTitle || "").trim();
    const storyAuthor = String(options.storyAuthor || "").trim();

    const templateIndex = path.join(templateDirectory, "index.html");
    const templateMain = path.join(templateDirectory, "main.js");
    const templateCss = path.join(templateDirectory, "style.css");
    const templateFavicon = path.join(templateDirectory, "favicon.ico");
    for (const filename of [compiledJsonPath, templateIndex, templateMain, templateCss, templateFavicon, inkRuntimePath]) {
        let stat;
        try {
            stat = await fs.promises.stat(filename);
        } catch (error) {
            throw new Error("Required web export file is missing: " + filename);
        }
        if (!stat.isFile()) throw new Error("Required web export path is not a file: " + filename);
    }

    let faviconPath = options.faviconFilePath ? path.resolve(options.faviconFilePath) : null;
    if( !faviconPath && options.projectDirectory ) {
        const projectDirectory = path.resolve(options.projectDirectory);
        for( const extension of FAVICON_EXTENSIONS ) {
            const candidate = path.join(projectDirectory, "favicon" + extension);
            try {
                const stat = await fs.promises.lstat(candidate);
                if( stat.isFile() && !stat.isSymbolicLink() ) {
                    faviconPath = candidate;
                    break;
                }
            } catch(error) {
                if( error.code !== "ENOENT" ) throw new Error("Could not inspect project favicon: " + error.message);
            }
        }
    }
    if( !faviconPath ) faviconPath = templateFavicon;
    const faviconExtension = path.extname(faviconPath).toLowerCase();
    if( !FAVICON_EXTENSIONS.includes(faviconExtension) || !imageMimeType("favicon" + faviconExtension) ) {
        throw new Error("Unsupported favicon format. Choose an ICO, PNG, or SVG file.");
    }
    const faviconMime = imageMimeType("favicon" + faviconExtension);
    let faviconStat;
    try {
        faviconStat = await fs.promises.stat(faviconPath);
    } catch (error) {
        throw new Error("The favicon file could not be found: " + faviconPath);
    }
    if (!faviconStat.isFile()) throw new Error("The favicon path is not a file: " + faviconPath);
    const faviconFilename = "favicon" + faviconExtension;

    // The title screen's cover is copied next to the page, so the game works on its own and offline.
    const coverFilePath = options.coverFilePath ? path.resolve(options.coverFilePath) : null;
    let coverFilename = "";
    if( coverFilePath ) {
        const coverExtension = path.extname(coverFilePath).toLowerCase();
        if( !COVER_EXTENSIONS.includes(coverExtension) ) {
            throw new Error("Unsupported cover image format. Choose a JPG, PNG, WebP, GIF or SVG file.");
        }
        let coverStat;
        try {
            coverStat = await fs.promises.stat(coverFilePath);
        } catch (error) {
            throw new Error("The cover image could not be found: " + coverFilePath);
        }
        if( !coverStat.isFile() ) throw new Error("The cover image path is not a file: " + coverFilePath);
        coverFilename = "cover" + coverExtension;
    }

    let storyJsonText = await fs.promises.readFile(compiledJsonPath, "utf8");
    storyJsonText = storyJsonText.replace(/^\uFEFF/, "");
    let parsedStory;
    try {
        parsedStory = JSON.parse(storyJsonText);
    } catch (error) {
        throw new Error("The compiled story JSON is invalid: " + error.message);
    }

    // Sound: which files the story names, and whether the page needs its volume control.
    const audioUse = collectAudioFromStory(parsedStory);
    // Pictures: which local files the story names, so the bundle carries them too.
    const imageUse = collectImagesFromStory(parsedStory);
    const audioVolume = Number.isFinite(Number(options.audioVolume)) ? Math.max(0, Math.min(100, Math.round(Number(options.audioVolume)))) : 50;
    const audioMix = options.audioMix || {};
    const audioLevel = key => Number.isFinite(Number(audioMix[key]))
        ? Math.max(0, Math.min(100, Math.round(Number(audioMix[key]))))
        : 100;

    let indexHtml = await fs.promises.readFile(templateIndex, "utf8");
    indexHtml = indexHtml.replace(/##STORY TITLE##/g, escapeHtml(storyTitle));
    indexHtml = indexHtml.replace(/##JAVASCRIPT FILENAME##/g, escapeHtml(jsFilename));
    indexHtml = indexHtml.replace(/##FAVICON-FILENAME##/g, faviconFilename);
    indexHtml = indexHtml.replace(/##FAVICON-TYPE##/g, faviconMime);
    indexHtml = indexHtml.replace(/##AUDIO##/g, audioUse.usesAudio ? "on" : "off");
    indexHtml = indexHtml.replace(/##VOLUME##/g, String(audioVolume));
    indexHtml = indexHtml.replace(/##MASTER-VOLUME##/g, String(audioLevel("master")));
    indexHtml = indexHtml.replace(/##MUSIC-VOLUME##/g, String(audioLevel("music")));
    indexHtml = indexHtml.replace(/##SFX-VOLUME##/g, String(audioLevel("sfx")));
    // The light/dark switch: off unless the writer allowed it
    indexHtml = indexHtml.replace(/##THEME-TOGGLE##/g, options.themeToggle ? "on" : "off");
    indexHtml = indexHtml.replace(/##THEME-INITIAL##/g, options.themeInitial === "dark" ? "dark" : "light");
    indexHtml = indexHtml.replace(/##THEME-ALTERNATE##/g, options.themeAlternate === "dark" ? "dark" : "light");
    // Last, so that text the writer typed can never be taken for another placeholder
    indexHtml = indexHtml.replace(/##TITLE-SCREEN##/g, () => TitleScreen.html({ title: storyTitle, author: storyAuthor, coverSrc: coverFilename }));

    const mainJs = await fs.promises.readFile(templateMain, "utf8");

    let css = await fs.promises.readFile(templateCss, "utf8");
    // Make the stock web template use the same visual variables as the preview.
    // The template owns the frame layout; this block only feeds it the values
    // from game.yaml and the story frame's 9:16 proportion.
    css += "\n\n/* Inky game.yaml visual settings */\n" +
        ":root {\n" +
        "  --bg: #ffffff; --text: #000000; --link: #0066cc;\n" +
        "  --font: system-ui, sans-serif; --font-size: 18px; --line-height: 1.7;\n" +
        "  --width: 42rem; --story-align: left; --choice-align: left;\n" +
        "}\n" +
        "body { font-family: var(--font, system-ui, sans-serif); color: var(--text, #000000); }\n" +
        ".container { background: var(--bg, #ffffff); color: var(--text, #000000); font-size: var(--font-size, 18px); text-align: var(--story-align, left); }\n" +
        "body[data-story-format=\"vertical\"] { --story-aspect-ratio: 9 / 16; --story-aspect-ratio-number: 0.5625; }\n" +
        "body[data-story-format=\"vertical\"] .container { width: min(calc(100cqw - 2 * var(--frame-gap, 24px)), var(--width, 42rem), calc((100cqh - 2 * var(--frame-gap, 24px)) * var(--story-aspect-ratio-number, 1))); aspect-ratio: var(--story-aspect-ratio, 1 / 1); height: auto; max-height: calc(100cqh - 2 * var(--frame-gap, 24px)); }\n" +
        "body[data-story-format=\"vertical\"] .outerContainer { box-sizing: border-box; container-type: size; padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }\n" +
        ".container { --follow-align: var(--story-align, left); }\n" +
        ".container .scene-title.alignLeft { --follow-align: left; }\n" +
        ".container .scene-title.alignCenter { --follow-align: center; }\n" +
        ".container .scene-title.alignRight { --follow-align: right; }\n" +
        ".container p { color: var(--text, #000000); font-family: var(--font, system-ui, sans-serif); font-size: var(--font-size, 18px); font-weight: normal; line-height: var(--line-height, 1.7); }\n" +
        // The text in the passage and in the choices footer follows the size of the frame.
        ".story-passage p, .story-choices p { font-size: inherit; }\n" +
        ".container > p.storyText { margin: 0; }\n" +
        ".container p.tags, .container .choice .tags { color: color-mix(in srgb, var(--text, #000000) 45%, var(--bg, #ffffff)); font-family: monospace; font-size: 0.8em; }\n" +
        ".container p.tags { text-align: center; }\n" +
        ".container .choice .tags { padding-left: 1em; }\n" +
        ".container p.alignLeft { text-align: left; }\n" +
        ".container p.alignCenter { text-align: center; }\n" +
        ".container p.alignRight { text-align: right; }\n" +
        ".container p.choice { box-sizing: border-box; margin: 0; padding: 0; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--text, #000000) 14%, transparent); border-radius: 0; background: transparent; line-height: var(--line-height, 1.7); text-align: var(--choice-align, left); }\n" +
        ".container :not(.choice) + p.choice { margin-top: 1.25em; }\n" +
        ".container .choice-button { position: relative; display: block; box-sizing: border-box; width: 100%; min-height: 44px; padding: 0.85em 2.5em 0.85em 0.75em; border: 0; border-radius: 0; background: transparent; color: var(--link, #0066cc); font: inherit; line-height: inherit; text-align: inherit; text-decoration: none; overflow-wrap: anywhere; cursor: pointer; outline: 2px solid transparent; outline-offset: -2px; touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: background-color 0.15s, box-shadow 0.15s; }\n" +
        ".container .choice-button::after { content: \"\"; position: absolute; top: 50%; right: 1em; width: 0.45em; height: 0.45em; border-top: 2px solid currentColor; border-right: 2px solid currentColor; transform: translateY(-50%) rotate(45deg); }\n" +
        ".container .choice-button:hover, .container .choice-button:focus-visible, .container .choice-button:active { background: color-mix(in srgb, var(--link-hover, #004c99) 14%, transparent); box-shadow: inset 3px 0 0 var(--link-hover, #004c99); color: var(--link-hover, #004c99); }\n" +
        ".container .choice .tags { color: color-mix(in srgb, var(--text, #000000) 45%, var(--bg, #ffffff)); font-family: monospace; font-size: 0.8em; padding-left: 1em; }\n" +
        ".container .choice .unclickable { display: block; padding: 0.85em 2.5em 0.85em 0.75em; overflow-wrap: anywhere; }\n";
    // The title screen shares its stylesheet with the Preview; the frame only needs to be its positioning box
    css += "\n/* Title screen */\n" +
        ".container { position: relative; }\n" +
        await fs.promises.readFile(path.join(__dirname, "titleScreen.css"), "utf8");
    const cssAddition = typeof options.cssAddition === "string" ? options.cssAddition : "";
    if (cssAddition) css += "\n" + cssAddition + "\n";

    await fs.promises.mkdir(targetDirectory, { recursive: true });
    const storyJsPath = path.join(targetDirectory, jsFilename);
    await Promise.all([
        fs.promises.writeFile(path.join(targetDirectory, "index.html"), indexHtml, "utf8"),
        fs.promises.writeFile(path.join(targetDirectory, "main.js"), mainJs, "utf8"),
        fs.promises.writeFile(path.join(targetDirectory, "style.css"), css, "utf8"),
        fs.promises.copyFile(inkRuntimePath, path.join(targetDirectory, "ink.js")),
        fs.promises.copyFile(path.join(__dirname, "richTextDom.js"), path.join(targetDirectory, "richtext.js")),
        fs.promises.copyFile(path.join(__dirname, "pager.js"), path.join(targetDirectory, "pager.js")),
        fs.promises.copyFile(faviconPath, path.join(targetDirectory, faviconFilename)),
        ...(coverFilename ? [fs.promises.copyFile(coverFilePath, path.join(targetDirectory, coverFilename))] : [])
    ]);

    // Copy the sound files the story uses into the exported folder's own audio folder.
    const audio = { copied: [], missing: [], invalid: audioUse.invalid };
    const audioReferences = new Map();
    if (audioUse.files.length > 0) {
        const audioTarget = path.join(targetDirectory, AUDIO_FOLDER);
        const projectRoot = options.projectDirectory ? path.resolve(options.projectDirectory) : null;
        const copiedSources = new Map();
        for (const file of audioUse.files) {
            const source = projectRoot ? resolveAudioFile(projectRoot, file) : null;
            if (!source) { audio.missing.push(file); continue; }
            let relativeOutput = exportedAudioPath(projectRoot, source, file);
            const previousSource = copiedSources.get(relativeOutput);
            if( previousSource && previousSource !== source ) {
                const digest = crypto.createHash("sha256").update(source).digest("hex").slice(0, 12);
                relativeOutput = path.join("__external", digest + "-" + path.basename(source)).split(path.sep).join("/");
            }
            const destination = path.resolve(audioTarget, relativeOutput);
            if( !destination.startsWith(audioTarget + path.sep) )
                throw new Error("Refusing to export an audio file outside the audio folder.");
            await fs.promises.mkdir(audioTarget, { recursive: true });
            await fs.promises.mkdir(path.dirname(destination), { recursive: true });
            await fs.promises.copyFile(source, destination);
            copiedSources.set(relativeOutput, source);
            audioReferences.set(file, relativeOutput);
            audio.copied.push(file);
        }
    }
    rewriteAudioReferences(parsedStory, audioReferences);

    // Copy the pictures the story shows. A picture keeps the path its tag uses; one named without
    // a folder and found in "images" or "image" is copied there and its tag is rewritten to that
    // path, so the exported page finds it. Remote pictures stay online.
    const images = { copied: [], missing: [], invalid: [] };
    const imageOutputs = new Set();
    const imageRewrites = new Map();
    if (imageUse.files.length > 0) {
        const projectRoot = options.projectDirectory ? path.resolve(options.projectDirectory) : null;
        // Cover and favicon are already in the bundle; a story picture may be the same file.
        const knownOutputs = new Map([[faviconFilename, path.resolve(faviconPath)]]);
        if( coverFilename ) knownOutputs.set(coverFilename, path.resolve(coverFilePath));
        for (const reference of imageUse.files) {
            const resolved = resolveImageReference(projectRoot, reference);
            if (resolved.kind === "remote") continue;
            if (resolved.kind === "invalid") { images.invalid.push(reference); continue; }
            if (resolved.kind === "missing") { images.missing.push(reference); continue; }
            const owner = knownOutputs.get(resolved.relative);
            if( owner && owner !== resolved.source ) {
                console.warn(`Skipping picture "${reference}": it would replace the exported ${resolved.relative}.`);
                images.invalid.push(reference);
                continue;
            }
            const destination = path.resolve(targetDirectory, resolved.relative.split("/").join(path.sep));
            if( !destination.startsWith(targetDirectory + path.sep) ) {
                images.invalid.push(reference);
                continue;
            }
            if( !owner ) {
                await fs.promises.mkdir(path.dirname(destination), { recursive: true });
                await fs.promises.copyFile(resolved.source, destination);
                knownOutputs.set(resolved.relative, resolved.source);
            }
            imageOutputs.add(resolved.relative);
            images.copied.push(reference);
            if( resolved.defaulted ) imageRewrites.set(reference, resolved.relative);
        }
    }
    if( imageRewrites.size ) rewriteImageReferences(parsedStory, imageRewrites);

    await fs.promises.writeFile(storyJsPath, "var storyContent = " + JSON.stringify(parsedStory) + ";\n", "utf8");

    const files = ["index.html", jsFilename, "main.js", "style.css", "ink.js", "richtext.js", "pager.js", faviconFilename]
        .concat(coverFilename ? [coverFilename] : [])
        .concat(Array.from(audioReferences.values()).map(file => AUDIO_FOLDER + "/" + file))
        .concat(Array.from(imageOutputs));

    return {
        targetDirectory: targetDirectory,
        files: Array.from(new Set(files)),
        audio: audio,
        images: images
    };
}

module.exports = { buildWebExport };
