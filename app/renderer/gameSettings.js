// The "Game settings" form. It shows the model of game.yaml, and saves it back
// (see gameStyle.js) each time something changes.

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { ipcRenderer } = require("electron");
const { GameStyle: G } = require("../gameStyle.js");
const { COVER_EXTENSIONS, IMAGE_FOLDER, LARGE_IMAGE_BYTES } = require("../imageTypes.js");

const params = new URLSearchParams(location.search);
const yamlPath = params.get("path");
const parentId = params.get("parent");
const virtualMode = params.get("virtual") === "1";
const initialYaml = params.get("yaml");

const $ = id => document.getElementById(id);
const FONT_NAME = /^[\p{L}\p{N} .\-']{1,60}$/u;
const ASPECT_RATIO = /^([0-9]+(?:\.[0-9]+)?)\s*[:/]\s*([0-9]+(?:\.[0-9]+)?)$/;

let model = G.defaultModel();
let customFontMode = false;
let saveTimer = null;

// ---- helpers ------------------------------------------------------------

// Any CSS color to "#rrggbb", for <input type="color">
const ctx = document.createElement("canvas").getContext("2d");
function toHex(color) {
    ctx.fillStyle = "#000000";
    ctx.fillStyle = color;
    const v = ctx.fillStyle;
    return /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000";
}

function fontStackFor(family) {
    if( family === "inherit" ) return "inherit";
    return G.FONT_STACKS[family] || `"${family}", ${G.FONT_STACKS.system}`;
}

function normalizeAspectRatio(value) {
    const match = String(value == null ? "" : value).trim().match(ASPECT_RATIO);
    if( !match ) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if( !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ) return null;
    return `${String(width)}:${String(height)}`;
}

async function populateSystemFontOptions() {
    const selectors = [
        $("font-family"),
        $("scene-title-family")
    ];
    try {
        const fonts = await ipcRenderer.invoke("list-system-fonts");
        selectors.forEach(select => {
            Array.from(select.options).forEach(option => {
                if( G.FONT_STACKS[option.value] ) option.style.fontFamily = G.FONT_STACKS[option.value];
            });
            const customOption = select.querySelector('option[value="custom"]');
            const builtInNames = new Set(Array.from(select.options).map(option => option.value.toLowerCase()));
            fonts.forEach(name => {
                if( builtInNames.has(name.toLowerCase()) ) return;
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                option.style.fontFamily = `"${name}"`;
                select.insertBefore(option, customOption);
                builtInNames.add(name.toLowerCase());
            });
        });
        render();
    } catch(error) {
        console.error("Could not load installed fonts in Game settings", error);
        window.alert("Could not load installed system fonts: " + error.message);
    }
}

// The project folder of a saved story; null while the story is still untitled.
function projectFolder() {
    return yamlPath && path.isAbsolute(yamlPath) ? path.dirname(yamlPath) : null;
}

// The frame the cover will be cropped to: the display format's own proportion,
// or none when the format follows the text (then the picture keeps its proportion).
function coverFrameRatio() {
    const format = model.layout.storyFormat;
    if( format === "vertical" ) return "9 / 16";
    if( format === "landscape" ) return "16 / 9";
    if( format === "square" ) return "1 / 1";
    if( format === "custom" ) {
        const ratio = normalizeAspectRatio(model.layout.customAspectRatio);
        if( ratio ) return ratio.replace(":", " / ");
    }
    return null;
}

let coverThumbToken = 0;

function showCoverThumbMessage(box, image, note, message) {
    box.dataset.state = "empty";
    image.removeAttribute("src");
    note.textContent = message;
}

// The same crop as the title screen (object-fit: cover, centered), so the writer
// sees which part of the picture the exported frame keeps.
function updateCoverThumb() {
    const box = $("story-cover-thumb");
    const image = $("story-cover-thumb-image");
    const note = $("story-cover-thumb-note");
    const ratio = coverFrameRatio();
    const setRatio = value => {
        if( value ) box.style.setProperty("--cover-ratio", value);
        else box.style.removeProperty("--cover-ratio");
    };
    setRatio(ratio);

    const reference = model.titles.cover;
    const file = reference ? G.resolveCoverFile(projectFolder(), reference) : null;

    if( !file ) {
        coverThumbToken++;
        showCoverThumbMessage(box, image, note, reference ? "The cover image is not in the project folder" : "No cover yet");
        return;
    }
    const url = pathToFileURL(file).href;
    if( image.getAttribute("src") === url ) return;   // same picture: only the frame may have changed

    const token = ++coverThumbToken;
    box.dataset.state = "loading";
    note.textContent = "Reading cover...";
    image.onload = () => {
        if( token !== coverThumbToken ) return;
        // With no format proportion the thumbnail keeps the picture's own shape.
        const natural = image.naturalWidth > 0 && image.naturalHeight > 0
            ? `${image.naturalWidth} / ${image.naturalHeight}`
            : null;
        setRatio(coverFrameRatio() || natural);
        box.dataset.state = "ready";
    };
    image.onerror = () => {
        if( token !== coverThumbToken ) return;
        showCoverThumbMessage(box, image, note, "The cover image could not be read");
    };
    image.src = url;
}

// Bringing a picture chosen outside the project into it: "<project>/images/<name>",
// with confirmation before an existing file is replaced. Returns { reference } or { error }.
const NOT_A_COVER = "Choose a cover image (JPG, JPEG, PNG, WebP, GIF or SVG).";

function copyCoverIntoProject(projectDir, source) {
    const fail = error => ({ error: error });
    if( !path.isAbsolute(projectDir) || !fs.existsSync(projectDir) )
        return fail("Save your story first, so the cover can be stored in the project folder.");
    const name = G.normalizeCoverReference(path.basename(source));
    if( !name ) return fail(NOT_A_COVER);
    const destination = path.join(projectDir, IMAGE_FOLDER, name);
    if( !G.pathStaysInsideRoot(projectDir, destination) )
        return fail("The cover must stay inside the project folder.");
    if( fs.existsSync(destination) &&
        !window.confirm(`${IMAGE_FOLDER}/${name} already exists in the project. Replace it?`) )
        return { error: "" };   // cancelled: the field keeps the cover it already had
    let bytes = 0;
    try {
        bytes = fs.statSync(source).size;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
    } catch(error) {
        return fail("The cover could not be copied into the project: " + (error.message || error));
    }
    if( bytes > LARGE_IMAGE_BYTES )
        window.alert(`${IMAGE_FOLDER}/${name} was imported, but it is large (${(bytes / (1024 * 1024)).toFixed(1)} MB). The exported game carries every byte of it.`);
    return { reference: G.coverReferenceForFile(projectDir, destination) };
}

function showWarnings(list) {
    const box = $("warnings");
    if( !list || list.length === 0 ) {
        box.hidden = true;
        box.textContent = "";
        return;
    }
    box.hidden = false;
    box.textContent = "";
    const intro = document.createElement("div");
    intro.textContent = "game.yaml had problems. Whatever could not be read uses the default, and saving here replaces the file:";
    box.appendChild(intro);
    const ul = document.createElement("ul");
    list.forEach(w => {
        const li = document.createElement("li");
        li.textContent = w;
        ul.appendChild(li);
    });
    box.appendChild(ul);
}


// ---- saving -------------------------------------------------------------

function writeNow(notifyParent = true) {
    clearTimeout(saveTimer);
    saveTimer = null;
    const yaml = G.toYaml(model);
    if( virtualMode ) {
        // Before the first project save, game.yaml exists as an in-memory
        // project document. Keep that document and the live preview in sync;
        // InkProject.save() will persist it beside the new .ink file.
        if( notifyParent && window.parent && window.parent !== window ) {
            window.parent.postMessage({ type: "game-style-virtual-update", path: "game.yaml", yaml: yaml }, "*");
        }
        showWarnings([]);
        return;
    }
    if( !yamlPath ) return;
    fs.writeFileSync(yamlPath, yaml, "utf8");
    // In the integrated editor, notify the parent page directly so it can
    // reload the matching Ace document as well as refreshing the preview.
    if( window.parent && window.parent !== window ) {
        if( notifyParent ) window.parent.postMessage({ type: "game-style-reload", path: yamlPath }, "*");
    } else if( notifyParent ) {
        ipcRenderer.send("game-settings-changed", parentId);
    }
    showWarnings([]);   // the file was rewritten from the form
}

// Parent calls this same-origin bridge before revealing the raw YAML editor.
// It flushes the debounce synchronously and returns exactly the bytes stored in game.yaml.
window.flushSettingsForAdvanced = function() {
    writeNow(false);
    return G.toYaml(model);
};

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    // Keep an unsaved project's in-memory game.yaml current before the writer
    // can press Save; on-disk projects retain the small debounce for dragging.
    if( virtualMode ) writeNow();
    else saveTimer = setTimeout(writeNow, 120);
}

// The parent asks for a synchronous flush before revealing the raw YAML editor.
// This avoids a delayed form save overwriting text typed immediately after the toggle.
window.addEventListener("message", event => {
    const data = event.data;
    if( !data ) return;
    if( data.type === "game-settings-reload" && typeof data.yaml === "string" ) {
        clearTimeout(saveTimer);
        saveTimer = null;
        const r = G.parseText(data.yaml);
        model = r.model;
        showWarnings(r.warnings);
        render();
        updatePresetHighlight();
        return;
    }
    if( data.type !== "game-settings-flush" || window.parent === window ) return;
    // For a rename flush, persist the form values before moving the file but do
    // not ask the parent to reload the old path: the parent will rename and
    // reopen the form on its new path immediately after this acknowledgement.
    writeNow(!data.suppressReload);
    window.parent.postMessage({ type: "game-settings-flushed", path: yamlPath, requestId: data.requestId }, "*");
});

window.addEventListener("beforeunload", () => { if( saveTimer ) writeNow(); });

// The visual settings are represented by controls, not a fictional story preview.

function sameColor(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
}

function updatePresetHighlight() {
    document.querySelectorAll(".chip").forEach(chip => {
        const preset = G.PRESETS.find(p => p.id === chip.dataset.preset);
        const c = model.colors;
        const active = preset.theme === model.theme
            && preset.font === model.font.family
            && sameColor(preset.colors.background, c.background)
            && sameColor(preset.colors.text, c.text)
            && sameColor(preset.colors.choice, c.choice)
            && !c.choiceHover;
        chip.classList.toggle("active", active);
    });
}

function setRangeValue(id, value) {
    const range = $(id);
    range.value = String(value);
    const number = $(`${id}-number`);
    number.value = range.value;
    number.classList.remove("invalid");
}

function wireRange(id, onChange) {
    const range = $(id);
    const number = $(`${id}-number`);
    const update = () => {
        const value = Number(range.value);
        number.value = range.value;
        number.classList.remove("invalid");
        onChange(value);
    };
    range.addEventListener("input", update);
    number.addEventListener("input", () => {
        const value = number.valueAsNumber;
        if( number.value === "" || !Number.isFinite(value)
            || value < Number(range.min) || value > Number(range.max)
            || !number.validity.valid ) {
            number.classList.add("invalid");
            return;
        }
        range.value = String(value);
        number.value = range.value;
        number.classList.remove("invalid");
        onChange(Number(range.value));
    });
    number.addEventListener("blur", () => {
        if( number.classList.contains("invalid") ) {
            number.value = range.value;
            number.classList.remove("invalid");
        }
    });
}

function render() {
    document.querySelector(`input[name="theme"][value="${model.theme}"]`).checked = true;

    const c = model.colors;
    ["background", "text", "choice"].forEach(key => {
        $("hex-" + key).value = c[key];
        $("hex-" + key).classList.remove("invalid");
        $("pick-" + key).value = toHex(c[key]);
    });
    const auto = !c.choiceHover;
    $("hover-auto").checked = auto;
    $("hex-hover").disabled = auto;
    $("pick-hover").disabled = auto;
    $("hex-hover").value = auto ? "" : c.choiceHover;
    $("hex-hover").placeholder = auto ? "automatic" : "";
    $("hex-hover").classList.remove("invalid");
    $("pick-hover").value = toHex(auto ? c.choice : c.choiceHover);

    const hasFontOption = select => Array.from(select.options)
        .some(option => option.value === model.font.family);
    const isCustom = !hasFontOption($("font-family"));
    customFontMode = isCustom;
    $("font-family").value = isCustom ? "custom" : model.font.family;
    $("font-custom").hidden = !customFontMode;
    if( isCustom ) $("font-custom").value = model.font.family;
    $("font-family").style.fontFamily = fontStackFor(model.font.family);

    setRangeValue("font-size", model.font.size);
    setRangeValue("line-height", model.layout.lineHeight);
    const full = model.layout.width === "full";
    $("width-full").checked = full;
    $("width").disabled = full;
    $("width-number").disabled = full;
    if( !full ) setRangeValue("width", model.layout.width);

    const textAlignment = document.querySelector(`input[name="align"][value="${model.layout.align}"]`);
    const choiceAlignment = document.querySelector(`input[name="choice-align"][value="${model.layout.choiceAlign}"]`);
    if( textAlignment ) textAlignment.checked = true;
    if( choiceAlignment ) choiceAlignment.checked = true;
    $("controls-show").checked = model.controls.show;
    ["master", "music", "sfx"].forEach(category => setRangeValue(`audio-${category}`, model.audio[category]));
    $("story-title").value = model.titles.story;
    $("story-author").value = model.titles.author;
    $("story-cover").value = model.titles.cover;
    $("story-cover").classList.remove("invalid");
    $("choose-story-cover").disabled = !yamlPath;

    const sceneStyle = model.titles.sceneStyle;
    const sceneFontSelect = $("scene-title-family");
    const sceneIsCustom = Object.prototype.hasOwnProperty.call(G.FONT_STACKS, sceneStyle.family) === false
        && sceneStyle.family !== "inherit"
        && !Array.from(sceneFontSelect.options).some(option => option.value === sceneStyle.family);
    sceneFontSelect.value = sceneIsCustom ? "custom" : sceneStyle.family;
    sceneFontSelect.style.fontFamily = fontStackFor(sceneStyle.family);
    $("scene-title-custom").hidden = !sceneIsCustom;
    if( sceneIsCustom ) $("scene-title-custom").value = sceneStyle.family;
    setRangeValue("scene-title-size", sceneStyle.size);
    const sceneColorDefault = !sceneStyle.color;
    $("scene-title-color-auto").checked = sceneColorDefault;
    $("scene-title-color").disabled = sceneColorDefault;
    $("scene-title-pick").disabled = sceneColorDefault;
    $("scene-title-color").value = sceneColorDefault ? "" : sceneStyle.color;
    $("scene-title-color").placeholder = sceneColorDefault ? "default" : "";
    $("scene-title-color").classList.remove("invalid");
    $("scene-title-pick").value = toHex(sceneStyle.color || model.colors.text);
    const sceneAlignment = document.querySelector(`input[name="scene-title-align"][value="${sceneStyle.align}"]`);
    if( sceneAlignment ) sceneAlignment.checked = true;

    updatePresetHighlight();
    updateCoverThumb();
}

// Something changed in the form: show it, and save
function changed() {
    updatePresetHighlight();
    updateCoverThumb();
    scheduleSave();
}

// ---- wiring -------------------------------------------------------------

function buildPresets() {
    G.PRESETS.forEach(p => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.dataset.preset = p.id;
        b.style.background = p.colors.background;
        b.style.color = p.colors.text;
        b.style.fontFamily = G.FONT_STACKS[p.font];
        b.innerHTML = '<b>Aa</b><small></small>';
        b.querySelector("small").textContent = p.label;
        b.addEventListener("click", () => {
            model = G.applyPreset(model, p.id);
            customFontMode = false;
            render();
            scheduleSave();
        });
        $("presets").appendChild(b);
    });
}

function wire() {
    document.querySelectorAll('input[name="theme"]').forEach(r => r.addEventListener("change", () => {
        if( !r.checked ) return;
        model.theme = r.value;
        // each theme starts from its own colors
        const base = G.PALETTES[r.value === "dark" ? "dark" : "light"];
        model.colors = { background: base.background, text: base.text, choice: base.choice, choiceHover: null };
        render();
        scheduleSave();
    }));

    ["background", "text", "choice"].forEach(key => {
        $("pick-" + key).addEventListener("input", () => {
            model.colors[key] = $("pick-" + key).value;
            $("hex-" + key).value = model.colors[key];
            $("hex-" + key).classList.remove("invalid");
            changed();
        });
        $("hex-" + key).addEventListener("input", () => {
            const v = $("hex-" + key).value.trim();
            if( G.isColor(v) ) {
                model.colors[key] = v;
                $("hex-" + key).classList.remove("invalid");
                $("pick-" + key).value = toHex(v);
                changed();
            } else {
                $("hex-" + key).classList.add("invalid");
            }
        });
    });

    $("hover-auto").addEventListener("change", () => {
        model.colors.choiceHover = $("hover-auto").checked ? null : toHex(model.colors.choice);
        render();
        scheduleSave();
    });
    $("pick-hover").addEventListener("input", () => {
        model.colors.choiceHover = $("pick-hover").value;
        $("hex-hover").value = model.colors.choiceHover;
        $("hex-hover").classList.remove("invalid");
        changed();
    });
    $("hex-hover").addEventListener("input", () => {
        const v = $("hex-hover").value.trim();
        if( G.isColor(v) ) {
            model.colors.choiceHover = v;
            $("hex-hover").classList.remove("invalid");
            $("pick-hover").value = toHex(v);
            changed();
        } else {
            $("hex-hover").classList.add("invalid");
        }
    });

    $("font-family").addEventListener("change", () => {
        const v = $("font-family").value;
        if( v === "custom" ) {
            customFontMode = true;
            $("font-custom").hidden = false;
            $("font-custom").focus();
            const typed = $("font-custom").value.trim();
            if( FONT_NAME.test(typed) ) { model.font.family = typed; changed(); }
        } else {
            customFontMode = false;
            model.font.family = v;
            $("font-custom").hidden = true;
            changed();
        }
    });
    $("font-custom").addEventListener("input", () => {
        const v = $("font-custom").value.trim();
        if( FONT_NAME.test(v) ) {
            model.font.family = v.replace(/'/g, "");
            $("font-custom").classList.remove("invalid");
            changed();
        } else {
            $("font-custom").classList.add("invalid");
        }
    });

    wireRange("font-size", value => {
        model.font.size = value;
        changed();
    });
    wireRange("line-height", value => {
        model.layout.lineHeight = Math.round(value * 100) / 100;
        changed();
    });
    wireRange("width", value => {
        $("width-full").checked = false;
        model.layout.width = value;
        changed();
    });
    $("width-full").addEventListener("change", () => {
        model.layout.width = $("width-full").checked ? "full" : Number($("width").value);
        $("width").disabled = $("width-full").checked;
        $("width-number").disabled = $("width-full").checked;
        changed();
    });

    document.querySelectorAll('input[name="align"]').forEach(r => r.addEventListener("change", () => {
        if( r.checked ) { model.layout.align = r.value; changed(); }
    }));
    document.querySelectorAll('input[name="choice-align"]').forEach(r => r.addEventListener("change", () => {
        if( r.checked ) { model.layout.choiceAlign = r.value; changed(); }
    }));
    ["master", "music", "sfx"].forEach(category => {
        wireRange(`audio-${category}`, value => {
            model.audio[category] = Math.round(value);
            changed();
        });
    });
    $("controls-show").addEventListener("change", () => {
        model.controls.show = $("controls-show").checked;
        changed();
    });

    $("story-title").addEventListener("input", () => {
        model.titles.story = $("story-title").value.trim();
        changed();
    });
    $("story-author").addEventListener("input", () => {
        model.titles.author = $("story-author").value.trim();
        changed();
    });
    // The cover is saved when the field is left or Enter is pressed, not on every key
    $("story-cover").addEventListener("change", () => {
        const value = $("story-cover").value.trim();
        const reference = value ? G.normalizeCoverReference(value) : "";
        if( reference === null ) {
            $("story-cover").classList.add("invalid");
            return;
        }
        $("story-cover").classList.remove("invalid");
        $("story-cover").value = reference;
        model.titles.cover = reference;
        changed();
    });
    $("choose-story-cover").addEventListener("click", async () => {
        const projectDir = path.dirname(yamlPath);
        const picked = await ipcRenderer.invoke("showOpenDialog", {
            title: "Choose the cover image",
            defaultPath: projectDir,
            properties: ["openFile"],
            filters: [{ name: "Images", extensions: COVER_EXTENSIONS.map(extension => extension.slice(1)) }]
        });
        if( !picked || picked.canceled || !picked.filePaths || picked.filePaths.length === 0 ) return;
        const source = picked.filePaths[0];
        let reference = G.coverReferenceForFile(projectDir, source);
        // A picture outside the project is copied into its "images" folder, so the
        // exported game can carry it; inside the project it is used where it is.
        if( !reference ) {
            const copied = copyCoverIntoProject(projectDir, source);
            if( !copied.reference ) {
                if( copied.error ) window.alert(copied.error);
                return;
            }
            reference = copied.reference;
        }
        $("story-cover").value = reference;
        $("story-cover").classList.remove("invalid");
        model.titles.cover = reference;
        changed();
    });
    $("clear-story-cover").addEventListener("click", () => {
        $("story-cover").value = "";
        $("story-cover").dispatchEvent(new Event("change", { bubbles: true }));
        $("story-cover").focus();
    });
    $("clear-story-title").addEventListener("click", () => {
        $("story-title").value = "";
        $("story-title").dispatchEvent(new Event("input", { bubbles: true }));
        $("story-title").focus();
    });
    $("clear-story-author").addEventListener("click", () => {
        $("story-author").value = "";
        $("story-author").dispatchEvent(new Event("input", { bubbles: true }));
        $("story-author").focus();
    });

    const sceneStyle = () => model.titles.sceneStyle;
    const sceneStyleChanged = () => {
        sceneStyle().configured = true;
        changed();
    };
    $("scene-title-family").addEventListener("change", () => {
        const style = sceneStyle();
        const value = $("scene-title-family").value;
        if( value === "custom" ) {
            $("scene-title-custom").hidden = false;
            $("scene-title-custom").focus();
            const typed = $("scene-title-custom").value.trim();
            if( FONT_NAME.test(typed) ) {
                style.family = typed.replace(/'/g, "");
                sceneStyleChanged();
            }
        } else {
            $("scene-title-custom").hidden = true;
            style.family = value;
            sceneStyleChanged();
        }
    });
    $("scene-title-custom").addEventListener("input", () => {
        const style = sceneStyle();
        const value = $("scene-title-custom").value.trim();
        if( FONT_NAME.test(value) ) {
            style.family = value.replace(/'/g, "");
            $("scene-title-custom").classList.remove("invalid");
            sceneStyleChanged();
        } else {
            $("scene-title-custom").classList.add("invalid");
        }
    });
    wireRange("scene-title-size", value => {
        sceneStyle().size = value;
        sceneStyleChanged();
    });
    $("scene-title-color-auto").addEventListener("change", () => {
        sceneStyle().color = $("scene-title-color-auto").checked ? null : toHex(model.colors.text);
        render();
        sceneStyleChanged();
    });
    $("scene-title-pick").addEventListener("input", () => {
        const style = sceneStyle();
        style.color = $("scene-title-pick").value;
        $("scene-title-color").value = style.color;
        $("scene-title-color").classList.remove("invalid");
        sceneStyleChanged();
    });
    $("scene-title-color").addEventListener("input", () => {
        const style = sceneStyle();
        const value = $("scene-title-color").value.trim();
        if( G.isColor(value) ) {
            style.color = value;
            $("scene-title-color").classList.remove("invalid");
            $("scene-title-pick").value = toHex(value);
            sceneStyleChanged();
        } else {
            $("scene-title-color").classList.add("invalid");
        }
    });
    document.querySelectorAll('input[name="scene-title-align"]').forEach(r => r.addEventListener("change", () => {
        if( r.checked ) {
            sceneStyle().align = r.value;
            sceneStyleChanged();
        }
    }));

    $("reset").addEventListener("click", () => {
        model = G.defaultModel();
        customFontMode = false;
        render();
        scheduleSave();
    });
}

// ---- start --------------------------------------------------------------

if( virtualMode ) {
    try {
        const r = G.parseText(initialYaml || G.templateYaml());
        model = r.model;
        showWarnings(r.warnings);
    } catch(e) {
        showWarnings([`game.yaml could not be opened: ${e.message}`]);
    }
} else if( yamlPath && fs.existsSync(yamlPath) ) {
    try {
        const r = G.parseText(fs.readFileSync(yamlPath, "utf8"));
        model = r.model;
        showWarnings(r.warnings);
    } catch(e) {
        showWarnings([`game.yaml could not be opened: ${e.message}`]);
    }
}

buildPresets();
wire();
render();
populateSystemFontOptions();
