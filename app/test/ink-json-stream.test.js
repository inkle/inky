"use strict";

const assert = require("assert");
const { InkJsonStream } = require("../main-process/inkJsonStream.js");
const { SourceMapProtocol, checksum } = require("../main-process/sourceMapProtocol.js");

describe("ink JSON stream framing (compiler stdout)", function () {
    const handshake = { version: 1, unit: "utf16", compiler: "ink-1.2.1" };
    const text = "Hello";
    const offsets = [1, 2, 3, 4, 5];
    const sourceMap = {
        version: 1, unit: "utf16", sequence: 0, streamEnd: 6, offsets,
        checksum: checksum(text, 0, 6, offsets)
    };
    const frames = [
        { issues: [] },
        { sourceMapProtocol: handshake },
        { "compile-success": true },
        { text, sourceMap },
        { needInput: true }
    ];
    const adjacent = frames.map(item => JSON.stringify(item)).join("");

    it("parses the exact issues+handshake concatenation observed in the real AppImage log", function () {
        const malformed = [];
        const stream = new InkJsonStream(raw => malformed.push(raw));
        const messages = stream.push('{"issues":[]}{"sourceMapProtocol":{"version":1,"unit":"utf16","compiler":"ink-1.2.1"}}');
        assert.deepStrictEqual(messages, frames.slice(0, 2));
        assert.deepStrictEqual(malformed, []);
        const protocol = new SourceMapProtocol();
        assert.strictEqual(protocol.handshake(messages[1].sourceMapProtocol), true);
    });

    it("handles adjacent frames without requiring newlines or chunk boundaries", function () {
        const errors = [];
        const stream = new InkJsonStream(raw => errors.push(raw));
        const messages = stream.push(adjacent);
        assert.deepStrictEqual(messages, frames);
        assert.deepStrictEqual(errors, []);
        const protocol = new SourceMapProtocol();
        assert.strictEqual(protocol.handshake(messages[1].sourceMapProtocol), true);
        assert.ok(protocol.acceptText(messages[3].text, messages[3].sourceMap));
    });

    it("handles every possible two-chunk split in the same data", function () {
        for (let split = 1; split < adjacent.length; split++) {
            const errors = [];
            const stream = new InkJsonStream(raw => errors.push(raw));
            const first = stream.push(adjacent.slice(0, split));
            const second = stream.push(adjacent.slice(split));
            assert.deepStrictEqual([...first, ...second], frames, "split at " + split);
            assert.deepStrictEqual(errors, [], "split at " + split);
        }
    });

    it("handles single-character chunks with blank lines and BOM", function () {
        const stream = new InkJsonStream(raw => assert.fail("Unexpected malformed JSON: " + raw));
        const messages = [];
        for (const ch of "\uFEFF \r\n" + adjacent + " \n")
            messages.push(...stream.push(ch));
        assert.deepStrictEqual(messages, frames);
    });

    it("ignores braces and escaped quotes inside a JSON string", function () {
        const payload = { text: 'curly }{ inside \\"quoted\\" text', details: { nested: ['}', '{', { okay: true }] } };
        const stream = new InkJsonStream(raw => assert.fail("Unexpected malformed JSON: " + raw));
        const encoded = JSON.stringify(payload) + '{"end":true}';
        const messages = [...stream.push(encoded.slice(0, 17)), ...stream.push(encoded.slice(17))];
        assert.deepStrictEqual(messages, [payload, {end: true}]);
    });

    it("reports malformed complete objects and continues with the next valid frame", function () {
        const errors = [];
        const stream = new InkJsonStream(raw => errors.push(raw));
        const messages = stream.push('{"bad":invalid}{"sourceMapProtocol":{"version":1,"unit":"utf16","compiler":"ink-1.2.1"}}');
        assert.strictEqual(errors.length, 1);
        assert.deepStrictEqual(messages, [{sourceMapProtocol: handshake}]);
    });

    it("survives many repeated back-to-back sessions without losing handshakes", function () {
        for (let repetition = 0; repetition < 100; repetition++) {
            const errors = [];
            const stream = new InkJsonStream(raw => errors.push(raw));
            const messages = stream.push(adjacent.repeat(5));
            assert.strictEqual(messages.length, frames.length * 5);
            assert.deepStrictEqual(errors, []);
        }
    });
});
