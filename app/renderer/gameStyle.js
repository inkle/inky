// Game style: the look of the story, read from "game.yaml" next to the story.
//
// One model, two renderers: the preview in the IDE and the exported web page.
// Everything is optional. Without a game.yaml the story gets the default look:
// white background, black text, system font, plain choices and no card.

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const jsyaml = require("js-yaml");
const { COVER_EXTENSIONS } = require("./imageTypes.js");
const { TitleScreen } = require("./titleScreen.js");
const { GameChrome } = require("./gameChrome.js");

const FILE_NAME = "game.yaml";

const FONT_STACKS = {
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif',
    serif:  'Georgia, "Times New Roman", "Noto Serif", serif',
    mono:   'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
};

const PALETTES = {
    light: { background: "#ffffff", text: "#000000", choice: "#0066CC" },
    dark:  { background: "#282828", text: "#faf1c6", choice: "#66B2FF" }
};

// Theme families: each one pairs a light preset with a dark preset. The player's light/dark
// switch moves between the two presets of the family the writer chose.
const FAMILIES = {
    "classic-night":  { light: "classic", dark: "night" },
    "sepia-terminal": { light: "sepia",   dark: "terminal" }
};

const PRESETS = [
    { id: "classic",  label: "Classic",  theme: "light", font: "system", family: "classic-night",  colors: { background: "#ffffff", text: "#000000", choice: "#0066CC" } },
    { id: "night",    label: "Night",    theme: "dark",  font: "system", family: "classic-night",  colors: { background: "#282828", text: "#faf1c6", choice: "#66B2FF" } },
    { id: "sepia",    label: "Sepia",    theme: "light", font: "serif",  family: "sepia-terminal", colors: { background: "#f4ecd8", text: "#433422", choice: "#8b4513" } },
    { id: "terminal", label: "Terminal", theme: "dark",  font: "mono",   family: "sepia-terminal", colors: { background: "#000000", text: "#33ff66", choice: "#ffd54a" } }
];

const KNOWN = {
    "":         ["theme", "theme_mode", "themes", "theme_family", "presentation", "ending", "colors", "font", "layout", "controls", "audio", "titles"],
    "themes":   ["light", "dark"],
    "colors":   ["background", "text", "choice", "choice_hover"],
    "font":     ["family", "size"],
    // Keep the retired container, choice_style and display-format keys recognized so older projects remain warning-free.
    "layout":   ["line_height", "width", "align", "choice_align", "container", "choice_style", "story_format", "custom_aspect_ratio"],
    "controls": ["show", "theme_toggle"],
    "ending": ["show", "text", "play_again_show", "play_again_text"],
    "audio":    ["volume", "master", "music", "sfx"],
    // Keep the retired story and author title styles recognized so older projects remain warning-free.
    "titles":   ["story", "author", "cover", "story_size", "story_size_px", "story_style", "author_style", "scene_style"]
};

const TEXT_ALIGNS = ["left", "center", "right"];
// Titles can also be "auto": follow the text below them (the default).
const TITLE_ALIGNS = ["auto", "left", "center", "right"];
const CHOICE_ALIGNS = ["left", "center", "right"];
const TITLE_STYLE_KEYS = ["family", "size", "color", "align"];

function isObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isColor(v) {
    if( typeof v !== "string" ) return false;
    v = v.trim();
    if( v.length === 0 || v.length > 40 || /[;{}<>\\]/.test(v) ) return false;
    if( /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ) return true;
    return typeof CSS !== "undefined" && CSS.supports("color", v);
}

// In YAML an unquoted #ffffff is a comment, so the value would silently
// disappear. Quote bare hex colors so "background: #ffffff" just works.
// Story title and author: between the words only single plain spaces (U+0020) are allowed. Any run
// of whitespace, control or invisible characters (tab, line break, U+00A0, U+200B...) becomes one
// space, and the start and the end are trimmed. A field being edited may keep any number of plain
// spaces at the start and at the end (keepEnds): everything that reads the value ignores them.
// Letters, digits and symbols are never touched.
const TITLE_SEPARATORS = /[\s\u0000-\u001F\u007F-\u009F\u180E\u200B-\u200F\u2060-\u2064\u206A-\u206F\u3164\uFEFF]+/g;
function normalizeTitleText(text, keepEnds) {
    const raw = String(text == null ? "" : text);
    const trimmed = value => value.replace(TITLE_SEPARATORS, " ").replace(/^ /, "").replace(/ $/, "");
    if( !keepEnds ) return trimmed(raw);
    const lead = raw.match(/^ */)[0];
    const rest = raw.slice(lead.length);
    const trail = rest.match(/ *$/)[0];
    return lead + trimmed(rest.slice(0, rest.length - trail.length)) + trail;
}

function quoteBareHexColors(text) {
    return text.replace(
        /^(\s*[A-Za-z_]+\s*:\s*)(#[0-9a-zA-Z]{3,12})(\s*(?:#.*)?)$/gm,
        (m, before, color, after) => `${before}"${color}"${after}`
    );
}

function checkKnownKeys(obj, group, w) {
    Object.keys(obj).forEach(k => {
        if( KNOWN[group].indexOf(k) == -1 ) {
            const name = group ? `${group}.${k}` : k;
            w.push(`Unknown option "${name}" was ignored.`);
        }
    });
}

function readGroup(raw, name, w) {
    const g = raw[name];
    if( g === undefined || g === null ) return {};
    if( !isObject(g) ) {
        w.push(`"${name}" should contain options, one per line, indented. It was ignored.`);
        return {};
    }
    checkKnownKeys(g, name, w);
    return g;
}

function pickNumber(group, groupName, key, min, max, fallback, w) {
    const v = group[key];
    if( v === undefined || v === null ) return fallback;
    if( typeof v === "number" && isFinite(v) && v >= min && v <= max ) return v;
    w.push(`"${groupName}.${key}" must be a number between ${min} and ${max} (got "${v}"). Using ${fallback}.`);
    return fallback;
}

function pickChoice(group, groupName, key, allowed, fallback, w) {
    const v = group[key];
    if( v === undefined || v === null ) return fallback;
    const s = String(v).toLowerCase().trim();
    if( allowed.indexOf(s) != -1 ) return s;
    w.push(`"${groupName}.${key}" must be one of: ${allowed.join(", ")} (got "${v}"). Using ${fallback}.`);
    return fallback;
}

// "image\\cover.JPG" becomes "image/cover.JPG". Anything that is not a picture path inside the
// project folder (a URL, an absolute path, "..") gives null.
function coverReference(value) {
    const reference = String(value).trim().replace(/\\/g, "/");
    if( !reference || /[\x00-\x1f]/.test(reference) || /^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("/") ) return null;
    if( reference.split("/").some(part => !part || part === "." || part === "..") ) return null;
    return COVER_EXTENSIONS.includes(path.extname(reference).toLowerCase()) ? reference : null;
}

// The cover file on disk, or null when it is not set, not a picture, outside the project or missing.
function resolveCoverFile(projectDir, reference) {
    const safeReference = reference ? coverReference(reference) : null;
    if( !projectDir || !safeReference ) return null;
    const file = path.resolve(projectDir, ...safeReference.split("/"));
    if( !pathStaysInsideRoot(projectDir, file) ) return null;
    try { return fs.statSync(file).isFile() ? file : null; }
    catch(e) { return null; }
}

// What to write in game.yaml for a picture the writer chose, or null when it is outside the project.
function coverReferenceForFile(projectDir, file) {
    return coverReference(path.relative(projectDir, file).split(path.sep).join("/"));
}

function pickColor(group, key, fallback, w) {
    const v = group[key];
    if( v === undefined || v === null ) return fallback;
    if( isColor(v) ) return String(v).trim();
    w.push(`"colors.${key}" is not a valid color (got "${v}"). Use something like "#ffffff". Using the default.`);
    return fallback;
}

function pickTitleStyle(group, name, w, defaultSize) {
    if( !isObject(group) ) {
        if( group !== undefined && group !== null )
            w.push(`"${name}" should contain title options, one per line, indented. It was ignored.`);
        group = {};
    } else {
        Object.keys(group).forEach(k => {
            if( TITLE_STYLE_KEYS.indexOf(k) === -1 )
                w.push(`Unknown option "${name}.${k}" was ignored.`);
        });
    }

    let family = "inherit";
    const rawFamily = group.family;
    if( rawFamily !== undefined && rawFamily !== null ) {
        const key = String(rawFamily).toLowerCase().trim();
        if( key === "inherit" || Object.prototype.hasOwnProperty.call(FONT_STACKS, key) ) {
            family = key;
        } else if( /^[\p{L}\p{N} .\-']{1,60}$/u.test(String(rawFamily).trim()) ) {
            family = String(rawFamily).trim().replace(/'/g, "");
        } else {
            w.push(`"${name}.family" is not valid (got "${rawFamily}"). Using inherit.`);
        }
    }

    let color = null;
    if( group.color !== undefined && group.color !== null ) {
        if( isColor(group.color) ) color = String(group.color).trim();
        else w.push(`"${name}.color" is not a valid color (got "${group.color}"). Using the default.`);
    }

    return {
        family: family,
        size: pickNumber(group, name, "size", 10, 100, defaultSize, w),
        color: color,
        align: pickChoice(group, name, "align", TITLE_ALIGNS, "auto", w),
        configured: TITLE_STYLE_KEYS.some(key => group[key] !== undefined && group[key] !== null)
    };
}

// A dual-theme story owns two complete, independently editable looks. Legacy style
// files use their root colors and font and derive the partner from theme_family.
function presetLook(theme, family) {
    const familyPair = FAMILIES[family] || FAMILIES["classic-night"];
    const preset = PRESETS.find(p => p.id === familyPair[theme]);
    return { colors: Object.assign({}, preset.colors, { choiceHover: null }), fontFamily: preset.font, fontSize: 18 };
}
function copyLook(look) {
    return { colors: Object.assign({}, look.colors), fontFamily: look.fontFamily, fontSize: look.fontSize };
}
function readThemeLook(raw, name, fallback, w) {
    if( raw === undefined || raw === null ) return copyLook(fallback);
    if( !isObject(raw) ) {
        w.push(`"themes.${name}" should contain colors and font options. Using the default.`);
        return copyLook(fallback);
    }
    for( const key of Object.keys(raw) ) {
        if( !["colors", "font", "size"].includes(key) ) w.push(`Unknown option "themes.${name}.${key}" was ignored.`);
    }
    let colors = {};
    if( raw.colors !== undefined && raw.colors !== null ) {
        if( isObject(raw.colors) ) {
            colors = raw.colors;
            for( const key of Object.keys(colors) ) {
                if( !KNOWN.colors.includes(key) ) w.push(`Unknown option "themes.${name}.colors.${key}" was ignored.`);
            }
        } else w.push(`"themes.${name}.colors" must contain named colors. Using the default.`);
    }
    const result = { colors: {
        background: pickColor(colors, "background", fallback.colors.background, w),
        text: pickColor(colors, "text", fallback.colors.text, w),
        choice: pickColor(colors, "choice", fallback.colors.choice, w),
        choiceHover: pickColor(colors, "choice_hover", fallback.colors.choiceHover, w)
    }, fontFamily: fallback.fontFamily,
       fontSize: pickNumber(raw, `themes.${name}`, "size", 10, 40, fallback.fontSize, w) };
    if( raw.font !== undefined && raw.font !== null ) {
        const value = String(raw.font).trim();
        if( Object.prototype.hasOwnProperty.call(FONT_STACKS, value) || /^[\p{L}\p{N} .\-']{1,60}$/u.test(value) )
            result.fontFamily = value.replace(/'/g, "");
        else w.push(`"themes.${name}.font" is not a valid font. Using the default.`);
    }
    return result;
}

// Turn what was read from the YAML into a complete, validated "model": the
// plain values of every option (what the settings form shows and saves).
// Never throws: invalid values are ignored and reported in "warnings".
function resolveModel(raw) {
    const w = [];
    if( raw !== undefined && raw !== null && !isObject(raw) ) {
        w.push(`${FILE_NAME} should contain options, one per line ("theme: dark"). It was ignored.`);
    }
    raw = isObject(raw) ? raw : {};
    checkKnownKeys(raw, "", w);

    // The retired "auto" theme opens as light, without a warning
    const theme = String(raw.theme).toLowerCase().trim() === "auto"
        ? "light"
        : pickChoice(raw, "", "theme", ["light", "dark"], "light", w);
    const base = PALETTES[theme === "dark" ? "dark" : "light"];
    const themeFamily = pickChoice(raw, "", "theme_family", Object.keys(FAMILIES), "", w);

    const colors = readGroup(raw, "colors", w);
    const font = readGroup(raw, "font", w);
    const layout = readGroup(raw, "layout", w);
    const controls = readGroup(raw, "controls", w);
    const audio = readGroup(raw, "audio", w);
    const titles = readGroup(raw, "titles", w);
    const presentation = pickChoice(raw, "", "presentation", ["traditional", "screen"], "traditional", w);
    const ending = readGroup(raw, "ending", w);
    let endingShow = true;
    if (ending.show !== undefined && ending.show !== null) {
        if (typeof ending.show === "boolean") endingShow = ending.show;
        else w.push('"ending.show" must be true or false. Using true.');
    }
    let endingText = "The End";
    if (ending.text !== undefined && ending.text !== null) {
        if (typeof ending.text !== "string" || !ending.text.trim() || ending.text.trim().length > 60 || /[\x00-\x1f\x7f]/.test(ending.text))
            w.push('"ending.text" must be 1-60 characters of single-line text. Using "The End".');
        else endingText = ending.text.trim();
    }
    // Both ending controls are independent; older game.yaml files keep the
    // reader's historical default: enabled replay with its English label.
    let playAgainShow = true;
    if (ending.play_again_show !== undefined && ending.play_again_show !== null) {
        if (typeof ending.play_again_show === "boolean") playAgainShow = ending.play_again_show;
        else w.push('"ending.play_again_show" must be true or false. Using true.');
    }
    let playAgainText = "Play Again";
    if (ending.play_again_text !== undefined && ending.play_again_text !== null) {
        if (typeof ending.play_again_text !== "string" || !ending.play_again_text.trim()
            || ending.play_again_text.trim().length > 60 || /[\x00-\x1f\x7f]/.test(ending.play_again_text))
            w.push('"ending.play_again_text" must be 1-60 characters of single-line text. Using "Play Again".');
        else playAgainText = ending.play_again_text.trim();
    }
    const themeModeOption = pickChoice(raw, "", "theme_mode", ["single", "dual"], "", w);
    // Old game.yaml files only had controls.theme_toggle; migrate them in memory.
    const themeMode = themeModeOption || (controls.theme_toggle === true ? "dual" : "single");
    const configuredThemes = readGroup(raw, "themes", w);

    // Font: system, serif, mono, or the name of a font the reader has installed
    let family = "system";
    const rawFamily = font.family;
    if( rawFamily !== undefined && rawFamily !== null ) {
        const key = String(rawFamily).toLowerCase().trim();
        if( Object.prototype.hasOwnProperty.call(FONT_STACKS, key) ) {
            family = key;
        } else if( /^[\p{L}\p{N} .\-']{1,60}$/u.test(String(rawFamily).trim()) ) {
            family = String(rawFamily).trim().replace(/'/g, "");
        } else {
            w.push(`"font.family" is not valid (got "${rawFamily}"). Using the system font.`);
        }
    }

    // Column width: a number of rem, or "full" for the whole page
    let width = 42;
    if( layout.width !== undefined && layout.width !== null ) {
        if( String(layout.width).toLowerCase().trim() === "full" ) {
            width = "full";
        } else if( typeof layout.width === "number" && isFinite(layout.width) && layout.width >= 20 && layout.width <= 100 ) {
            width = layout.width;
        } else {
            w.push(`"layout.width" must be a number between 20 and 100, or "full" (got "${layout.width}"). Using 42.`);
        }
    }

    let show = true;
    if( controls.show !== undefined && controls.show !== null ) {
        if( typeof controls.show === "boolean" ) show = controls.show;
        else w.push(`"controls.show" must be true or false (got "${controls.show}"). Using true.`);
    }
    // Lets the player switch between the light and the dark look (a button in the story menu)
    let themeToggle = false;
    if( controls.theme_toggle !== undefined && controls.theme_toggle !== null ) {
        if( typeof controls.theme_toggle === "boolean" ) themeToggle = controls.theme_toggle;
        else w.push(`"controls.theme_toggle" must be true or false (got "${controls.theme_toggle}"). Using false.`);
    }
    // The story frame has a single format: vertical (9:16). Retired story_format
    // and custom_aspect_ratio keys are ignored.
    let storyTitle = "";
    if( titles.story !== undefined && titles.story !== null ) {
        if( typeof titles.story === "string" ) storyTitle = normalizeTitleText(titles.story);
        else w.push(`"titles.story" must be text (got "${titles.story}"). Using no story title.`);
    }
    let author = "";
    if( titles.author !== undefined && titles.author !== null ) {
        if( typeof titles.author === "string" ) author = normalizeTitleText(titles.author);
        else w.push(`"titles.author" must be text (got "${titles.author}"). Using no author.`);
    }

    // The cover is a picture inside the project folder, written with "/" (image/cover.jpg)
    let cover = "";
    if( titles.cover !== undefined && titles.cover !== null ) {
        const reference = typeof titles.cover === "string" ? coverReference(titles.cover) : null;
        if( reference ) cover = reference;
        else w.push(`"titles.cover" must be the path of an image inside the project folder, such as "image/cover.jpg" (${COVER_EXTENSIONS.join(", ")}). Using no cover.`);
    }

    const DEFAULT_STORY_TITLE_PX = 56;
    let storySizePx = DEFAULT_STORY_TITLE_PX;
    if( Object.prototype.hasOwnProperty.call(titles, "story_size_px") ) {
        storySizePx = pickNumber(titles, "titles", "story_size_px", 16, 100, DEFAULT_STORY_TITLE_PX, w);
    } else if( Object.prototype.hasOwnProperty.call(titles, "story_size") ) {
        const oldPercent = pickNumber(titles, "titles", "story_size", 40, 160, 100, w);
        storySizePx = Math.round(DEFAULT_STORY_TITLE_PX * oldPercent / 100);
    }

    const defaultFontSize = pickNumber(font, "font", "size", 10, 40, 18, w);
    const primary = { colors: {
        background: pickColor(colors, "background", base.background, w),
        text: pickColor(colors, "text", base.text, w),
        choice: pickColor(colors, "choice", base.choice, w),
        choiceHover: pickColor(colors, "choice_hover", null, w)
    }, fontFamily: family, fontSize: defaultFontSize };
    const variants = {
        light: theme === "light" ? copyLook(primary) : presetLook("light", themeFamily),
        dark: theme === "dark" ? copyLook(primary) : presetLook("dark", themeFamily)
    };
    if( !themeModeOption && !themeFamily ) {
        variants[theme === "light" ? "dark" : "light"].fontFamily = family;
    }
    for( const side of ["light", "dark"] ) {
        variants[side].fontSize = defaultFontSize;
    }
    if( themeMode === "dual" ) {
        for( const side of ["light", "dark"] ) {
            variants[side] = readThemeLook(configuredThemes[side], side, variants[side], w);
        }
    }
    const currentLook = themeMode === "dual" ? variants[theme] : primary;

    return {
        model: {
            theme: theme,
            themeMode: themeMode,
            presentation: presentation,
            ending: { show: endingShow, text: endingText, playAgainShow, playAgainText },
            themes: variants,
            themeFamily: themeFamily,
            colors: Object.assign({}, currentLook.colors),
            font: { family: currentLook.fontFamily, size: currentLook.fontSize },
            layout: {
                lineHeight: pickNumber(layout, "layout", "line_height", 1, 3, 1.7, w),
                width: width,
                align: pickChoice(layout, "layout", "align", TEXT_ALIGNS, "left", w),
                choiceAlign: pickChoice(layout, "layout", "choice_align", CHOICE_ALIGNS, "left", w)
            },
            controls: { show: show, themeToggle: themeMode === "dual" || (themeModeOption === "" && themeToggle) },
            legacyThemeToggle: !themeModeOption && themeToggle,
            audio: {
                volume: Math.round(pickNumber(audio, "audio", "volume", 0, 100, 50, w)),
                master: Math.round(pickNumber(audio, "audio", "master", 0, 100, 100, w)),
                music: Math.round(pickNumber(audio, "audio", "music", 0, 100, 100, w)),
                sfx: Math.round(pickNumber(audio, "audio", "sfx", 0, 100, 100, w))
            },
            titles: {
                story: storyTitle,
                author: author,
                cover: cover,
                storySize: storySizePx,
                sceneStyle: pickTitleStyle(titles.scene_style, "titles.scene_style", w, 33.3)
            }
        },
        warnings: w
    };
}

function fontStack(family) {
    return Object.prototype.hasOwnProperty.call(FONT_STACKS, family)
        ? FONT_STACKS[family]
        : `"${family}", ${FONT_STACKS.system}`;
}

function presetById(id) {
    return PRESETS.find(p => p.id === id) || null;
}

// The look the player's switch leads to: the other preset of the writer's family. Colors the
// writer customized apply to the current look only; the other one uses the family's own values.
// Without a family it is the plain palette of the other theme, in the same font.
function alternateLook(model) {
    const other = model.theme === "dark" ? "light" : "dark";
    if( model.themeMode === "dual" && model.themes && model.themes[other] ) {
        const look = model.themes[other];
        return { theme: other, colors: Object.assign({}, look.colors), fontFamily: look.fontFamily, fontSize: look.fontSize };
    }
    const family = model.themeFamily ? FAMILIES[model.themeFamily] : null;
    const partner = family ? presetById(family[other]) : null;
    if( partner ) {
        return {
            theme: partner.theme,
            colors: Object.assign({}, partner.colors, { choiceHover: null }),
            fontFamily: partner.font
        };
    }
    return {
        theme: other,
        colors: Object.assign({}, PALETTES[other], { choiceHover: null }),
        fontFamily: model.font.family
    };
}

// A model, ready to be shown: the CSS values the preview and the export use
function modelToStyle(model) {
    const palette = model.theme === "dark" ? "dark" : "light";
    const c = model.colors;
    // Automatic hover keeps the Choices color; the page only adds a soft tint of it and a side bar
    const withHover = colors => ({
        background: colors.background,
        text: colors.text,
        choice: colors.choice,
        choiceHover: colors.choiceHover || colors.choice
    });

    const stack = fontStack(model.font.family);

    // The switch lives in the story menu, so it exists only while the buttons are shown
    const themeToggle = model.themeMode === "dual" &&
        (!model.legacyThemeToggle || !!(model.controls.show && model.controls.themeToggle));
    let alternate = null;
    if( themeToggle ) {
        const look = alternateLook(model);
        alternate = {
            theme: look.theme,
            colors: withHover(look.colors),
            font: { family: fontStack(look.fontFamily), size: look.fontSize || model.font.size }
        };
    }

    return {
        theme: model.theme,
        presentation: model.presentation || "traditional",
        ending: { show: model.ending.show, text: model.ending.text, playAgainShow: model.ending.playAgainShow, playAgainText: model.ending.playAgainText },
        alternate: alternate,
        palette: palette,
        colors: withHover(c),
        font: { family: stack, size: model.font.size },
        layout: {
            lineHeight: model.layout.lineHeight,
            width: model.layout.width === "full" ? "100%" : model.layout.width + "rem",
            align: model.layout.align,
            choiceAlign: model.layout.choiceAlign
        },
        controls: { show: model.controls.show, themeToggle: themeToggle },
        audio: {
            volume: model.audio.volume,
            master: model.audio.master,
            music: model.audio.music,
            sfx: model.audio.sfx
        },
        titles: {
            story: model.titles.story,
            author: model.titles.author,
            cover: model.titles.cover,
            storySize: model.titles.storySize,
            sceneStyle: Object.assign({}, model.titles.sceneStyle)
        }
    };
}

function resolve(raw) {
    const r = resolveModel(raw);
    return { style: modelToStyle(r.model), warnings: r.warnings };
}

// text: the contents of a game.yaml
function parseText(text) {
    let raw;
    try {
        raw = jsyaml.load(quoteBareHexColors(text));
    } catch(e) {
        const line = e.mark ? ` (line ${e.mark.line + 1})` : "";
        const r = resolveModel({});
        r.warnings.push(`${FILE_NAME} could not be read${line}: ${e.reason || e.message}. Using the default style.`);
        return { style: modelToStyle(r.model), model: r.model, warnings: r.warnings };
    }
    const r = resolveModel(raw);
    return { style: modelToStyle(r.model), model: r.model, warnings: r.warnings };
}

// The style file is "game.yaml" unless the writer renamed it. A rename is remembered in a tiny
// file next to the story (POINTER_FILE) that holds the new file name. Without it, a lone YAML
// file in the story folder that clearly is a style file (it has theme, colors, font, layout...)
// is used, so a project whose pointer was lost on the way still finds its style.
const POINTER_FILE = ".inky-style";

function isStyleFileName(name) {
    return typeof name === "string" && /^[^\\/:*?"<>|\x00-\x1f]+\.ya?ml$/i.test(name) && name !== "." && name !== "..";
}

function isRegularFile(absPath) {
    try { return fs.statSync(absPath).isFile(); }
    catch(e) { return false; }
}

function looksLikeStyleFile(absPath) {
    try {
        const raw = jsyaml.load(quoteBareHexColors(fs.readFileSync(absPath, "utf8")));
        return isObject(raw) && Object.keys(raw).some(key => KNOWN[""].indexOf(key) !== -1);
    } catch(e) {
        return false;
    }
}

function entryFileNameFor(dir) {
    try {
        const remembered = fs.readFileSync(path.join(dir, POINTER_FILE), "utf8").trim();
        if( isStyleFileName(remembered) && isRegularFile(path.join(dir, remembered)) ) return remembered;
    } catch(e) { /* no pointer: use the default name */ }
    if( isRegularFile(path.join(dir, FILE_NAME)) ) return FILE_NAME;
    try {
        const candidates = fs.readdirSync(dir)
            .filter(name => isStyleFileName(name) && isRegularFile(path.join(dir, name)) && looksLikeStyleFile(path.join(dir, name)));
        if( candidates.length === 1 ) return candidates[0];
    } catch(e) { /* unreadable folder: use the default name */ }
    return FILE_NAME;
}

// Remember which file is the style file. The default name needs no pointer.
function setEntryFileName(dir, name) {
    const pointerPath = path.join(dir, POINTER_FILE);
    if( name === FILE_NAME ) {
        try { fs.unlinkSync(pointerPath); } catch(e) { if( e.code !== "ENOENT" ) throw e; }
        return;
    }
    if( !isStyleFileName(name) ) throw new Error("Not a valid style file name: " + name);
    fs.writeFileSync(pointerPath, name + "\n", "utf8");
}

// The pointer file's raw content (or null), to put it back if a rename has to be undone.
function readEntryPointer(dir) {
    try { return fs.readFileSync(path.join(dir, POINTER_FILE), "utf8"); }
    catch(e) { return null; }
}

function restoreEntryPointer(dir, content) {
    const pointerPath = path.join(dir, POINTER_FILE);
    if( content === null ) { try { fs.unlinkSync(pointerPath); } catch(e) { /* already gone */ } }
    else fs.writeFileSync(pointerPath, content, "utf8");
}

function entryFilePathFor(project) {
    const dir = project && project.mainInk && project.mainInk.projectDir;
    return dir ? path.join(dir, entryFileNameFor(dir)) : null;
}

function normalizedRelativePath(value) {
    return String(value || "").replace(/\\/g, "/");
}

function projectDocument(project, absPath) {
    if( !project || !absPath || !project.mainInk || !project.mainInk.projectDir ) return null;
    const rel = normalizedRelativePath(path.relative(project.mainInk.projectDir, absPath));
    return (project.files || []).find(f => normalizedRelativePath(f.relativePath()) === rel) || null;
}

function readProjectText(project, absPath) {
    const document = projectDocument(project, absPath);
    if( document && !document.isLoading ) return { text: document.getValue(), document: document, exists: true };
    if( document && document.isLoading ) {
        try { return { text: fs.readFileSync(absPath, "utf8"), document: document, exists: true }; }
        catch(e) { /* continue with the regular file read fallback */ }
    }
    try {
        return { text: fs.readFileSync(absPath, "utf8"), document: null, exists: true };
    } catch(e) {
        return { text: "", document: null, exists: false, error: e };
    }
}

function pathStaysInsideRoot(rootPath, targetPath) {
    const root = path.resolve(rootPath);
    const target = path.resolve(targetPath);
    const relative = path.relative(root, target);
    if( !relative || relative === "." || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) ) return false;

    // Lexical containment alone is insufficient when a project contains a
    // symlink to another directory. Resolve the nearest existing path component
    // so a pointer cannot escape the story folder through a symlink.
    try {
        const realRoot = fs.realpathSync(root);
        let existing = target;
        // lstat is intentional: existsSync follows symlinks and reports false
        // for a dangling symlink, which could otherwise be used to escape the
        // root when a new subfolder is created through it.
        while( true ) {
            try {
                fs.lstatSync(existing);
                break;
            } catch(e) {
                if( e.code !== "ENOENT" && e.code !== "ENOTDIR" ) return false;
                const parent = path.dirname(existing);
                if( parent === existing ) return false;
                existing = parent;
            }
        }
        const realExisting = fs.realpathSync(existing);
        const realRelative = path.relative(realRoot, realExisting);
        return realRelative === "" || (realRelative !== ".." && !realRelative.startsWith(".." + path.sep) && !path.isAbsolute(realRelative));
    } catch(e) {
        return false;
    }
}

// The project's only visual configuration is game.yaml at the story root.
function activeStylePathFor(project) {
    return entryFilePathFor(project);
}

function filePathFor(project) {
    return entryFilePathFor(project);
}

function isActiveStylePath(project, absPath) {
    const entry = entryFilePathFor(project);
    return !!(entry && absPath && path.resolve(entry) === path.resolve(absPath));
}

function loadFromProject(project) {
    const entryPath = entryFilePathFor(project);
    if( !entryPath ) {
        // A brand-new project has no folder until its first save. Its virtual
        // game.yaml document still drives the preview and the Visual form.
        const virtualDocument = project && Array.isArray(project.files)
            ? project.files.find(file => String(file.relativePath && file.relativePath() || "").replace(/\\/g, "/").toLowerCase() === FILE_NAME.toLowerCase() && file.isYamlFile)
            : null;
        if( virtualDocument && !virtualDocument.isLoading ) {
            const parsed = parseText(virtualDocument.getValue());
            return { style: parsed.style, warnings: parsed.warnings, path: null, entryPath: null, exists: true, document: virtualDocument };
        }
        const r = resolve({});
        return { style: r.style, warnings: [], path: null, entryPath: null, exists: false };
    }

    if( !pathStaysInsideRoot(project.mainInk.projectDir, entryPath) ) {
        const r = resolve({});
        return { style: r.style, warnings: [`${FILE_NAME} must resolve inside the story folder. Using the default style.`], path: entryPath, entryPath: entryPath, exists: false };
    }
    const entry = readProjectText(project, entryPath);
    if( !entry.exists ) {
        const r = resolve({});
        return { style: r.style, warnings: [], path: entryPath, entryPath: entryPath, exists: false };
    }

    const parsed = parseText(entry.text);
    return { style: parsed.style, warnings: parsed.warnings, path: entryPath, entryPath: entryPath, exists: true };
}

// ---- The reader's surrounding surface -----------------------------------

// The outside of the reading frame belongs to the active theme, not to the
// editor's theme or a fixed website color. Keep these values derived rather
// than adding another setting to game.yaml. CSS color-mix supports the same
// custom CSS colors the writer can enter in the Visual/Advanced editor.
// RGB brightness of hex colors. Color names/functions are still accepted by the
// style editor; those use the conservative branch below, without guessing.
function hexBrightness(color) {
    const value = String(color || "").trim();
    const short = /^#([0-9a-f]{3,4})$/i.exec(value);
    const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value);
    const channels = short
        ? short[1].slice(0, 3).split("").map(c => parseInt(c + c, 16))
        : long
            ? [0, 2, 4].map(i => parseInt(long[1].slice(i, i + 2), 16))
            : null;
    if( !channels ) return null;
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function readerAmbience(look) {
    const dark = look.theme === "dark";
    const background = look.colors.background;
    const text = look.colors.text;
    // Near-black players (Terminal, or a custom midnight look) need a *lighter*
    // surrounding surface: a black drop shadow on black cannot give separation.
    // Other dark frames sit against a deeper, cool outer canvas instead.
    const brightness = hexBrightness(background);
    const nearBlack = dark && brightness !== null && brightness < 28;
    return {
        outer: dark
            ? nearBlack
                ? `color-mix(in srgb, ${background} 22%, #1e2a29)`
                : `color-mix(in srgb, ${background} 16%, #0d131a)`
            : `color-mix(in srgb, ${background} 87%, ${text})`,
        // A real 1px edge makes the player legible even when its shadow and the
        // surrounding backdrop are close in value. It is not an extra YAML option.
        border: `color-mix(in srgb, ${text} ${dark ? (nearBlack ? 30 : 21) : 20}%, ${background})`,
        deep: dark ? "rgba(0, 0, 0, 0.74)" : `color-mix(in srgb, ${text} 26%, transparent)`,
        soft: dark ? "rgba(0, 0, 0, 0.42)" : `color-mix(in srgb, ${text} 16%, transparent)`,
        halo: `color-mix(in srgb, ${text} ${nearBlack ? 20 : dark ? 12 : 5}%, transparent)`
    };
}

// ---- The exported web page ----------------------------------------------

// CSS appended to the template's style.css. It only sets the variables the
// template already uses, so the template stays plain and readable.
function exportCss(style) {
    const colorVars = (look) => {
        const c = look.colors;
        const ambience = readerAmbience(look);
        return [
            `    --bg: ${c.background};`,
            `    --text: ${c.text};`,
            `    --link: ${c.choice};`,
            `    --link-hover: ${c.choiceHover};`,
            `    --reader-outer-bg: ${ambience.outer};`,
            `    --reader-frame-border: ${ambience.border};`,
            `    --reader-shadow-deep: ${ambience.deep};`,
            `    --reader-shadow-soft: ${ambience.soft};`,
            `    --reader-shadow-halo: ${ambience.halo};`
        ];
    };
    const out = [
        "",
        "/* ---- Game style, generated from game.yaml ---- */",
        ":root {",
        `    --font: ${style.font.family};`,
        `    --font-size: ${style.font.size}px;`,
        `    --line-height: ${style.layout.lineHeight};`,
        `    --width: ${style.layout.width};`,
        `    --story-align: ${style.layout.align};`,
        `    --choice-align: ${style.layout.choiceAlign};`
    ];
    out.push(...colorVars({ theme: style.theme, colors: style.colors }));
    out.push("}");
    // The look the player's switch leads to; the page sets data-look="alternate" on <html>
    if( style.alternate ) out.push(
        "",
        "/* Alternate look: the player's light/dark switch */",
        ':root[data-look="alternate"] {',
        `    --font: ${style.alternate.font.family};`,
        `    --font-size: ${style.alternate.font.size}px;`,
        ...colorVars(style.alternate),
        "}"
    );
    const sceneStyle = style.titles.sceneStyle;
    if( sceneStyle.configured ) {
        const declarations = [];
        // "Default" keeps the base scene-title serif, matching Preview.  Specifying
        // only a size must not silently switch the font family in Web Export.
        if( sceneStyle.family !== "inherit" ) declarations.push(`    font-family: ${Object.prototype.hasOwnProperty.call(FONT_STACKS, sceneStyle.family)
            ? FONT_STACKS[sceneStyle.family]
            : `"${sceneStyle.family}", ${FONT_STACKS.system}`};`);
        declarations.push(`    font-size: ${sceneStyle.size}px;`);
        if( sceneStyle.color ) declarations.push(`    color: ${sceneStyle.color};`);
        // "auto" follows the text.
        if( sceneStyle.align !== "auto" ) declarations.push(`    text-align: ${sceneStyle.align};`);
        out.push("", ".container .scene-title {", ...declarations, "}");
    }
    if( !style.controls.show && style.controls.themeToggle ) out.push(
        "",
        "/* In dual mode the theme switch remains accessible even without save/restart controls. */",
        "#story-menu #rewind, #story-menu #save, #story-menu #reload { display: none; }"
    );
    else if( !style.controls.show ) out.push(
        "",
        "/* Buttons hidden: a story that has sound keeps only its volume control. */",
        "#controls:not(.has-audio) {", "    display: none;", "}",
        "#controls.has-audio > :not(.audio-control) {", "    display: none;", "}",
        "#controls.has-audio > .audio-control:after {", "    content: none;", "}"
    );
    return out.join("\n") + "\n";
}

// ---- The preview in the IDE ----------------------------------------------

let currentStyle = resolve({}).style;
// The Preview can try the player's light/dark switch: this says which look it shows now
let previewAlternate = false;
let previewProject = null;
let previewStyle = null;

function current() {
    return currentStyle;
}

// The look on screen: the alternate one while the player's switch is on
function lookOf(style, showAlternate) {
    if( showAlternate && style.alternate ) {
        return { theme: style.alternate.theme, colors: style.alternate.colors, family: style.alternate.font.family, size: style.alternate.font.size };
    }
    return { theme: style.theme, colors: style.colors, family: style.font.family, size: style.font.size };
}

function togglePreviewLook() {
    const style = previewStyle || currentStyle;
    if( !style.alternate ) return;
    previewAlternate = !previewAlternate;
    applyToPreview(style, previewProject);
}

function setPreviewTheme(theme) {
    const style = previewStyle || currentStyle;
    if( !["light", "dark"].includes(theme) ) return;
    previewAlternate = !!(style.alternate && style.alternate.theme === theme);
    applyToPreview(style, previewProject);
}

// The preview reads these custom properties (see "Game style" in main.css),
// so the story looks the same as in the exported page, whatever the IDE theme.
function applyToPreview(style, project) {
    const player = document.getElementById("player");
    if( !player ) return;
    previewProject = project || null;
    previewStyle = style;
    if( !style.alternate ) previewAlternate = false;
    const look = lookOf(style, previewAlternate);
    const ambience = readerAmbience(look);
    const vars = {
        "--reader-outer-bg": ambience.outer,
        "--reader-frame-border": ambience.border,
        "--reader-shadow-deep": ambience.deep,
        "--reader-shadow-soft": ambience.soft,
        "--reader-shadow-halo": ambience.halo,
        "--game-bg": look.colors.background,
        "--game-text": look.colors.text,
        "--game-choice": look.colors.choice,
        "--game-choice-hover": look.colors.choiceHover,
        "--game-font": look.family,
        "--game-font-size": look.size + "px",
        "--game-line-height": String(style.layout.lineHeight),
        "--game-width": style.layout.width,
        "--game-story-align": style.layout.align,
        "--game-choice-align": style.layout.choiceAlign,
        "--game-story-aspect-ratio": "9 / 16",
        "--game-story-aspect-ratio-number": String(9 / 16)
    };
    Object.keys(vars).forEach(k => {
        if( vars[k] ) player.style.setProperty(k, vars[k]);
        else player.style.removeProperty(k);
    });
    player.classList.add("game-preview-panel");
    player.dataset.presentation = style.presentation || "traditional";
    player.dataset.endingShow = style.ending.show ? "1" : "0";
    player.dataset.endingText = style.ending.text;
    player.dataset.endingPlayAgainShow = style.ending.playAgainShow ? "1" : "0";
    player.dataset.endingPlayAgainText = style.ending.playAgainText;
    player.querySelectorAll(".story-replay-choice").forEach(replay => {
        replay.hidden = !style.ending.playAgainShow;
        const button = replay.querySelector("button");
        if (button) button.textContent = style.ending.playAgainText;
        const footer = replay.closest(".story-choices");
        if (footer && !footer.querySelector(".choice:not(.story-replay-choice)")) {
            footer.hidden = !style.ending.playAgainShow;
            const frame = footer.closest(".innerText");
            if (frame) frame.classList.toggle("has-choices", style.ending.playAgainShow);
        }
    });
    player.querySelectorAll(".story-ending").forEach(marker => {
        const EndingMarker = require("./endingMarker.js");
        EndingMarker.update(marker, style.ending.show, style.ending.text);
    });
    player.dataset.controlsShow = style.controls.show ? "1" : "0";
    // The switch in the story menu names the theme it leads to
    player.dataset.themeToggle = style.controls.themeToggle ? "1" : "0";
    player.dataset.themeTarget = style.alternate
        ? (previewAlternate ? style.theme : style.alternate.theme)
        : "";
    const globalTags = project && project.mainInk && project.mainInk.symbols
        && Array.isArray(project.mainInk.symbols.globalTags)
        ? project.mainInk.symbols.globalTags : [];
    player.dataset.globalTags = JSON.stringify(globalTags);
    // The title screen is built from these (see titleScreen.js); the story itself no longer shows them.
    const coverFile = project && project.mainInk ? resolveCoverFile(project.mainInk.projectDir, style.titles.cover) : null;
    player.dataset.storyTitle = style.titles.story || "";
    player.dataset.storyTitleSize = String(style.titles.storySize);
    player.dataset.storyAuthor = style.titles.author || "";
    player.dataset.storyCover = coverFile ? pathToFileURL(coverFile).href : "";
    TitleScreen.sync(player);
    GameChrome.sync(player);
    const sceneStyle = style.titles.sceneStyle;
    const scenePrefix = "--game-scene-title-";
    const sceneVars = {
        family: sceneStyle.family === "inherit" ? "" : (Object.prototype.hasOwnProperty.call(FONT_STACKS, sceneStyle.family) ? FONT_STACKS[sceneStyle.family] : `"${sceneStyle.family}", ${FONT_STACKS.system}`),
        size: sceneStyle.size + "px",
        color: sceneStyle.color || "",
        align: sceneStyle.align === "auto" ? "" : sceneStyle.align
    };
    if( !sceneStyle.configured ) {
        ["family", "size", "color", "align"].forEach(key => player.style.removeProperty(scenePrefix + key));
    } else {
        Object.keys(sceneVars).forEach(key => {
            if( sceneVars[key] ) player.style.setProperty(scenePrefix + key, sceneVars[key]);
            else player.style.removeProperty(scenePrefix + key);
        });
    }
}

let reloadListener = null;

function reload(project) {
    const r = loadFromProject(project);
    currentStyle = r.style;
    applyToPreview(r.style, project);
    if( reloadListener ) reloadListener(r.style);
    if( r.warnings.length > 0 )
        console.warn(`${FILE_NAME}:\n- ` + r.warnings.join("\n- "));
    return r;
}

// ---- Presets and YAML serialization for the Visual form -----------------

// A preset sets the theme, the colors and the font. Size, width and
// alignment stay as the writer had them. The four presets form two families
// (see FAMILIES): the player's light/dark switch moves between the two presets of a family.


function defaultModel() {
    return resolveModel({}).model;
}

function applyPreset(model, presetId) {
    const preset = PRESETS.find(p => p.id === presetId);
    if( !preset ) return model;
    return Object.assign({}, model, {
        theme: preset.theme,
        themeFamily: preset.family,
        colors: Object.assign({}, preset.colors, { choiceHover: null }),
        font: Object.assign({}, model.font, { family: preset.font })
    });
}

// Change one side without touching the other. The root look mirrors the initial theme
// for all existing readers of the model, while `themes` remains the canonical pair.
function setThemeLook(model, side, look) {
    if( !["light", "dark"].includes(side) ) return model;
    model.themes[side] = copyLook(look);
    if( model.theme === side ) {
        model.colors = Object.assign({}, look.colors);
        model.font.family = look.fontFamily;
        model.font.size = look.fontSize;
    }
    return model;
}
function applyThemePreset(model, side, presetId) {
    const preset = PRESETS.find(p => p.id === presetId && p.theme === side);
    if( !preset ) return model;
    return setThemeLook(model, side, { colors: Object.assign({}, preset.colors, { choiceHover: null }), fontFamily: preset.font, fontSize: model.themes[side].fontSize });
}
function setThemeMode(model, mode) {
    if( mode !== "single" && mode !== "dual" ) return model;
    if( mode === "dual" && model.themeMode !== "dual" ) {
        // Capture existing customized colors/font before enabling the other theme.
        setThemeLook(model, model.theme, { colors: model.colors, fontFamily: model.font.family, fontSize: model.font.size });
    }
    if( mode === "single" && model.themeMode === "dual" ) {
        // Keep the currently configured initial look as the single theme.
        const look = model.themes[model.theme];
        model.colors = Object.assign({}, look.colors);
        model.font.family = look.fontFamily;
        model.font.size = look.fontSize;
    }
    model.themeMode = mode;
    model.controls.themeToggle = mode === "dual";
    model.legacyThemeToggle = false;
    return model;
}

// Serialize all visual settings without explanatory comments.
function toYaml(model) {
    const q = v => JSON.stringify(String(v));
    const dual = model.themeMode === "dual";
    const c = model.colors;
    const lines = [
        `theme: ${model.theme}`,
        ...(model.presentation === "screen" ? ["presentation: screen"] : []),
        "ending:",
        `  show: ${model.ending.show}`,
        `  text: ${q(model.ending.text)}`,
        `  play_again_show: ${model.ending.playAgainShow !== false}`,
        `  play_again_text: ${q(model.ending.playAgainText || "Play Again")}`,
        ...(dual ? ["theme_mode: dual"] : []),
        ...(!dual && model.themeFamily ? [`theme_family: ${model.themeFamily}`] : []),
        ""
    ];
    if( dual ) {
        lines.push("themes:");
        for( const side of ["light", "dark"] ) {
            const look = model.themes[side];
            lines.push(`  ${side}:`,
                `    font: ${Object.prototype.hasOwnProperty.call(FONT_STACKS, look.fontFamily) ? look.fontFamily : q(look.fontFamily)}`,
                `    size: ${look.fontSize}`,
                "    colors:",
                `      background: ${q(look.colors.background)}`,
                `      text: ${q(look.colors.text)}`,
                `      choice: ${q(look.colors.choice)}`,
                `      choice_hover: ${look.colors.choiceHover ? q(look.colors.choiceHover) : "null"}`);
        }
    } else {
        lines.push("colors:",
            `  background: ${q(c.background)}`,
            `  text: ${q(c.text)}`,
            `  choice: ${q(c.choice)}`,
            `  choice_hover: ${c.choiceHover ? q(c.choiceHover) : "null"}`);
    }
    lines.push("",
        ...(!dual ? ["font:",
            `  family: ${Object.prototype.hasOwnProperty.call(FONT_STACKS, model.font.family) ? model.font.family : q(model.font.family)}`,
            `  size: ${model.font.size}`, ""] : []),
        "layout:",
        `  line_height: ${model.layout.lineHeight}`,
        `  width: ${model.layout.width === "full" ? "full" : model.layout.width}`,
        `  align: ${model.layout.align}`,
        `  choice_align: ${model.layout.choiceAlign}`,
        "",
        "controls:",
        `  show: ${model.controls.show}`,
        ...(!dual ? [`  theme_toggle: ${!!model.controls.themeToggle}`] : []),
        "",
        "audio:",
        `  volume: ${model.audio.volume}`,
        `  master: ${model.audio.master}`,
        `  music: ${model.audio.music}`,
        `  sfx: ${model.audio.sfx}`);
    if( model.titles.story || model.titles.author || model.titles.cover || model.titles.storySize !== 56 || model.titles.sceneStyle.configured ) {
        lines.push("", "titles:");
        const storyTitle = normalizeTitleText(model.titles.story);
        const storyAuthor = normalizeTitleText(model.titles.author);
        if( storyTitle ) lines.push(`  story: ${q(storyTitle)}`);
        if( storyAuthor ) lines.push(`  author: ${q(storyAuthor)}`);
        if( model.titles.cover ) lines.push(`  cover: ${q(model.titles.cover)}`);
        if( model.titles.storySize !== 56 ) lines.push(`  story_size_px: ${model.titles.storySize}`);
        const sceneStyle = model.titles.sceneStyle;
        if( sceneStyle.configured ) {
            lines.push("  scene_style:");
            lines.push(`    family: ${sceneStyle.family === "inherit" || Object.prototype.hasOwnProperty.call(FONT_STACKS, sceneStyle.family) ? sceneStyle.family : q(sceneStyle.family)}`);
            lines.push(`    size: ${sceneStyle.size}`);
            lines.push(`    color: ${sceneStyle.color ? q(sceneStyle.color) : "null"}`);
            lines.push(`    align: ${sceneStyle.align}`);
        }
    }
    lines.push("");
    return lines.join("\n");
}

function InkProjectNotify(project) {
    // The project event is optional so the style module remains unit-testable.
    try {
        const Project = require("./inkProject.js").InkProject;
        if( Project.events && Project.events.gameStyleChanged ) Project.events.gameStyleChanged();
        return true;
    } catch(e) { return false; }
}

// ---- Creating the file ---------------------------------------------------

function templateYaml() {
    return [
        "theme: light",
        "presentation: traditional",
        "ending:",
        "  show: true",
        '  text: "The End"',
        "  play_again_show: true",
        '  play_again_text: "Play Again"',
        "",
        "colors:",
        '  background: "#ffffff"',
        '  text: "#000000"',
        '  choice: "#0066CC"',
        "  choice_hover: null",
        "",
        "font:",
        "  family: system",
        "  size: 18",
        "",
        "layout:",
        "  line_height: 1.7",
        "  width: 42",
        "  align: left",
        "  choice_align: left",
        "",
        "controls:",
        "  show: true",
        "  theme_toggle: false",
        "",
        "audio:",
        "  volume: 50",
        "  master: 100",
        "  music: 100",
        "  sfx: 100",
        ""
    ].join("\n");
}

exports.GameStyle = {
    FILE_NAME: FILE_NAME,
    parseText: parseText,
    normalizeTitleText: normalizeTitleText,
    isColor: isColor,
    resolve: resolve,
    resolveModel: resolveModel,
    modelToStyle: modelToStyle,
    defaultModel: defaultModel,
    applyPreset: applyPreset,
    applyThemePreset: applyThemePreset,
    setThemeLook: setThemeLook,
    setThemeMode: setThemeMode,
    normalizeCoverReference: coverReference,
    resolveCoverFile: resolveCoverFile,
    coverReferenceForFile: coverReferenceForFile,
    toYaml: toYaml,
    PRESETS: PRESETS,
    FAMILIES: FAMILIES,
    alternateLook: alternateLook,
    togglePreviewLook: togglePreviewLook,
    setPreviewTheme: setPreviewTheme,
    FONT_STACKS: FONT_STACKS,
    PALETTES: PALETTES,
    loadFromProject: loadFromProject,
    POINTER_FILE: POINTER_FILE,
    entryFilePathFor: entryFilePathFor,
    entryFileNameFor: entryFileNameFor,
    setEntryFileName: setEntryFileName,
    readEntryPointer: readEntryPointer,
    restoreEntryPointer: restoreEntryPointer,
    isStyleFileName: isStyleFileName,
    filePathFor: filePathFor,
    activeStylePathFor: activeStylePathFor,
    isActiveStylePath: isActiveStylePath,
    pathStaysInsideRoot: pathStaysInsideRoot,
    exportCss: exportCss,
    readerAmbience: readerAmbience,
    templateYaml: templateYaml,
    current: current,
    applyToPreview: applyToPreview,
    reload: reload,
    setReloadListener: fn => { reloadListener = fn; }
};
