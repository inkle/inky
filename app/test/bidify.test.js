const assert = require('assert');
const { bidify, stripBidi, bidifyJson, LRI, RLI, PDI } = require('../renderer/bidify.js');

var passed = 0;
var failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('  PASS: ' + name);
    } catch (e) {
        failed++;
        console.log('  FAIL: ' + name);
        console.log('    ' + e.message);
    }
}

console.log('bidify.test.js');
console.log('');

// --- stripBidi ---

console.log('stripBidi:');

test('removes LRI, RLI, PDI characters', function () {
    assert.strictEqual(stripBidi(LRI + 'hello' + PDI), 'hello');
    assert.strictEqual(stripBidi(RLI + 'مرحبا' + PDI), 'مرحبا');
    assert.strictEqual(stripBidi(LRI + 'a' + PDI + RLI + 'ب' + PDI), 'aب');
});

test('returns empty string unchanged', function () {
    assert.strictEqual(stripBidi(''), '');
});

test('returns null/undefined unchanged', function () {
    assert.strictEqual(stripBidi(null), null);
    assert.strictEqual(stripBidi(undefined), undefined);
});

test('returns text without markers unchanged', function () {
    assert.strictEqual(stripBidi('hello world'), 'hello world');
});

console.log('');

// --- bidify ---

console.log('bidify:');

test('pure LTR text returned unchanged', function () {
    assert.strictEqual(bidify('hello world'), 'hello world');
});

test('pure RTL text (Arabic) wrapped with RLI...PDI', function () {
    var result = bidify('مرحبا');
    assert.strictEqual(result, RLI + 'مرحبا' + PDI);
});

test('pure RTL text (Hebrew) wrapped with RLI...PDI', function () {
    var result = bidify('שלום');
    assert.strictEqual(result, RLI + 'שלום' + PDI);
});

test('mixed Arabic and English', function () {
    var result = bidify('Hello مرحبا World');
    assert.strictEqual(result, LRI + 'Hello' + PDI + ' ' + RLI + 'مرحبا' + PDI + ' ' + LRI + 'World' + PDI);
});

test('Arabic with period (punctuation)', function () {
    var result = bidify('مرحبا.');
    // Period is neutral, Arabic is RTL
    assert.ok(result.indexOf(RLI) !== -1, 'should contain RLI marker');
    assert.ok(result.indexOf(PDI) !== -1, 'should contain PDI marker');
});

test('ink syntax preserved: choice marker', function () {
    var result = bidify('* مرحبا');
    // * and space are neutral, Arabic is RTL
    assert.strictEqual(stripBidi(result), '* مرحبا');
});

test('ink syntax preserved: divert', function () {
    var result = bidify('-> knot_name');
    // All LTR/neutral — should be unchanged
    assert.strictEqual(result, '-> knot_name');
});

test('ink syntax preserved: knot header', function () {
    var result = bidify('=== knot_name ===');
    assert.strictEqual(result, '=== knot_name ===');
});

test('multi-line text', function () {
    var input = 'Hello\nمرحبا\nWorld';
    var result = bidify(input);
    var lines = result.split('\n');
    assert.strictEqual(lines[0], 'Hello');
    assert.strictEqual(lines[1], RLI + 'مرحبا' + PDI);
    assert.strictEqual(lines[2], 'World');
});

test('empty string', function () {
    assert.strictEqual(bidify(''), '');
});

test('null input', function () {
    assert.strictEqual(bidify(null), null);
});

test('whitespace only', function () {
    assert.strictEqual(bidify('   '), '   ');
});

test('idempotency: bidify(bidify(x)) === bidify(x)', function () {
    var input = 'Hello مرحبا World';
    var once = bidify(input);
    var twice = bidify(once);
    assert.strictEqual(once, twice);
});

test('round-trip: stripBidi(bidify(x)) === x', function () {
    var input = 'Hello مرحبا World שלום';
    assert.strictEqual(stripBidi(bidify(input)), input);
});

test('Persian text', function () {
    var result = bidify('سلام');
    assert.strictEqual(result, RLI + 'سلام' + PDI);
});

test('Syriac text', function () {
    // Syriac character range U+0700-U+074F
    var result = bidify('\u0710\u0712\u0713');
    assert.strictEqual(result, RLI + '\u0710\u0712\u0713' + PDI);
});

test('Thaana text', function () {
    // Thaana character range U+0780-U+07BF
    var result = bidify('\u0780\u0781\u0782');
    assert.strictEqual(result, RLI + '\u0780\u0781\u0782' + PDI);
});

test('NKo text', function () {
    // NKo character range U+07C0-U+07FF
    var result = bidify('\u07C0\u07C1\u07C2');
    assert.strictEqual(result, RLI + '\u07C0\u07C1\u07C2' + PDI);
});

test('Samaritan text', function () {
    // Samaritan character range U+0800-U+083F
    var result = bidify('\u0800\u0801\u0802');
    assert.strictEqual(result, RLI + '\u0800\u0801\u0802' + PDI);
});

test('Mandaic text', function () {
    // Mandaic character range U+0840-U+085F
    var result = bidify('\u0840\u0841\u0842');
    assert.strictEqual(result, RLI + '\u0840\u0841\u0842' + PDI);
});

console.log('');

// --- bidifyJson ---

console.log('bidifyJson:');

test('bidifies story text strings (^prefix)', function () {
    var input = JSON.stringify({ root: ['^مرحبا', '\n'] });
    var result = bidifyJson(input);
    var parsed = JSON.parse(result);
    assert.strictEqual(parsed.root[0], '^' + RLI + 'مرحبا' + PDI);
    assert.strictEqual(parsed.root[1], '\n');
});

test('leaves non-text strings unchanged', function () {
    var input = JSON.stringify({ root: ['ev', '/ev', 'done'] });
    var result = bidifyJson(input);
    assert.strictEqual(result, input);
});

test('handles nested arrays', function () {
    var input = JSON.stringify({ root: [['^Hello مرحبا', '\n'], 'done'] });
    var result = bidifyJson(input);
    var parsed = JSON.parse(result);
    var text = parsed.root[0][0];
    assert.ok(text.startsWith('^'));
    assert.ok(text.indexOf(RLI) !== -1);
    assert.strictEqual(parsed.root[1], 'done');
});

test('handles null input', function () {
    assert.strictEqual(bidifyJson(null), null);
});

test('handles pure LTR JSON content', function () {
    var input = JSON.stringify({ root: ['^Hello World', '\n'] });
    var result = bidifyJson(input);
    var parsed = JSON.parse(result);
    assert.strictEqual(parsed.root[0], '^Hello World');
});

console.log('');

// --- Summary ---

console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
    process.exit(1);
}
