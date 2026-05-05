// bidify.js — Unicode Bidi support for RTL languages
// Inserts invisible directional isolate characters (LRI, RLI, PDI)
// to help the Unicode Bidi Algorithm render mixed-direction text correctly.

const LRI = '\u2066'; // Left-to-Right Isolate
const RLI = '\u2067'; // Right-to-Left Isolate
const PDI = '\u2069'; // Pop Directional Isolate

// Unicode codepoint ranges for RTL scripts
function isRTL(cp) {
    return (
        (cp >= 0x0590 && cp <= 0x05FF) || // Hebrew
        (cp >= 0xFB1D && cp <= 0xFB4F) || // Hebrew Presentation Forms
        (cp >= 0x0600 && cp <= 0x06FF) || // Arabic
        (cp >= 0x0750 && cp <= 0x077F) || // Arabic Supplement
        (cp >= 0x08A0 && cp <= 0x08FF) || // Arabic Extended-A
        (cp >= 0xFB50 && cp <= 0xFDFF) || // Arabic Presentation Forms-A
        (cp >= 0xFE70 && cp <= 0xFEFF) || // Arabic Presentation Forms-B
        (cp >= 0x0700 && cp <= 0x074F) || // Syriac
        (cp >= 0x0860 && cp <= 0x086F) || // Syriac Supplement
        (cp >= 0x0780 && cp <= 0x07BF) || // Thaana
        (cp >= 0x07C0 && cp <= 0x07FF) || // NKo
        (cp >= 0x0800 && cp <= 0x083F) || // Samaritan
        (cp >= 0x0840 && cp <= 0x085F)    // Mandaic
    );
}

// LTR strong characters: Latin, Greek, Cyrillic, etc.
function isLTR(cp) {
    return (
        (cp >= 0x0041 && cp <= 0x005A) || // Basic Latin uppercase
        (cp >= 0x0061 && cp <= 0x007A) || // Basic Latin lowercase
        (cp >= 0x00C0 && cp <= 0x02AF) || // Latin Extended
        (cp >= 0x0370 && cp <= 0x03FF) || // Greek and Coptic
        (cp >= 0x0400 && cp <= 0x04FF) || // Cyrillic
        (cp >= 0x0500 && cp <= 0x052F) || // Cyrillic Supplement
        (cp >= 0x1E00 && cp <= 0x1EFF) || // Latin Extended Additional
        (cp >= 0x1F00 && cp <= 0x1FFF) || // Greek Extended
        (cp >= 0x2C00 && cp <= 0x2C5F) || // Glagolitic
        (cp >= 0xA720 && cp <= 0xA7FF)    // Latin Extended-D
    );
}

// Remove existing bidi isolate markers
function stripBidi(text) {
    if (!text) return text;
    return text.replace(/[\u2066\u2067\u2069]/g, '');
}

// Iterate over codepoints and group into script runs
function getScriptRuns(line) {
    var runs = [];
    var currentRun = null;

    for (var i = 0; i < line.length; i++) {
        var cp = line.codePointAt(i);
        var dir;

        if (isRTL(cp)) {
            dir = 'rtl';
        } else if (isLTR(cp)) {
            dir = 'ltr';
        } else {
            dir = 'neutral';
        }

        // Surrogate pair — skip the low surrogate
        if (cp > 0xFFFF) i++;

        if (currentRun && currentRun.dir === dir) {
            currentRun.text += String.fromCodePoint(cp);
        } else {
            currentRun = { dir: dir, text: String.fromCodePoint(cp) };
            runs.push(currentRun);
        }
    }

    return runs;
}

// Bidify a single line by wrapping script runs with directional isolates
function bidifyLine(line) {
    var runs = getScriptRuns(line);
    var hasRTL = runs.some(function(r) { return r.dir === 'rtl'; });

    // No RTL content — return as-is
    if (!hasRTL) return line;

    var result = '';
    for (var i = 0; i < runs.length; i++) {
        var run = runs[i];
        if (run.dir === 'rtl') {
            result += RLI + run.text + PDI;
        } else if (run.dir === 'ltr') {
            result += LRI + run.text + PDI;
        } else {
            result += run.text;
        }
    }
    return result;
}

// Bidify text: process each line independently.
// Strips existing markers first to ensure idempotency.
function bidify(text) {
    if (!text) return text;

    // Strip existing markers to prevent double-wrapping
    text = stripBidi(text);

    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
        lines[i] = bidifyLine(lines[i]);
    }
    return lines.join('\n');
}

// Bidify compiled ink JSON: find story text strings (prefixed with ^)
// and bidify their content.
function bidifyJson(jsonString) {
    if (!jsonString) return jsonString;

    var obj = JSON.parse(jsonString);
    bidifyJsonNode(obj);
    return JSON.stringify(obj);
}

function bidifyJsonNode(node) {
    if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) {
            if (typeof node[i] === 'string' && node[i].length > 1 && node[i][0] === '^') {
                // Story text string: bidify content after the ^ prefix
                node[i] = '^' + bidify(node[i].substring(1));
            } else if (typeof node[i] === 'object' && node[i] !== null) {
                bidifyJsonNode(node[i]);
            }
        }
    } else if (typeof node === 'object' && node !== null) {
        for (var key in node) {
            if (node.hasOwnProperty(key)) {
                if (typeof node[key] === 'object' && node[key] !== null) {
                    bidifyJsonNode(node[key]);
                } else if (typeof node[key] === 'string' && node[key].length > 1 && node[key][0] === '^') {
                    node[key] = '^' + bidify(node[key].substring(1));
                }
            }
        }
    }
}

exports.bidify = bidify;
exports.stripBidi = stripBidi;
exports.bidifyJson = bidifyJson;
exports.LRI = LRI;
exports.RLI = RLI;
exports.PDI = PDI;
