const assert = require("assert");
const crypto = require("crypto");
const { SourceMapProtocol, checksum } = require("../main-process/sourceMapProtocol.js");

describe("source map protocol handshake", function () {
    const handshake = { version: 1, unit: "utf16", compiler: "ink-1.2.1" };
    const event = (sequence, streamEnd, offsets, text = "ab") => ({
        version: 1, unit: "utf16", sequence, streamEnd, offsets,
        checksum: checksum(text, sequence, streamEnd, offsets)
    });

    it("requires a compatible handshake before accepting maps", function () {
        const protocol = new SourceMapProtocol();
        assert.strictEqual(protocol.acceptText("ab", event(0, 2, [0, 1])), null);
        assert.strictEqual(protocol.handshake(handshake), false);
    });

    it("accepts only ordered complete maps from this session", function () {
        const protocol = new SourceMapProtocol();
        assert.strictEqual(protocol.handshake(handshake), true);
        assert.deepStrictEqual(protocol.acceptText("ab", event(0, 4, [1, 2])).offsets, [1, 2]);
        assert.deepStrictEqual(protocol.acceptText("c", event(1, 7, [6], "c")).offsets, [6]);
    });

    it("validates the checksum even for an empty text event", function () {
        const protocol = new SourceMapProtocol();
        assert.strictEqual(protocol.handshake(handshake), true);
        const map = { ...event(0, 0, [], ""), checksum: "invalid" };
        assert.strictEqual(protocol.acceptText("", map), null);
    });

    it("computes the checksum only once per text event", function () {
        const protocol = new SourceMapProtocol();
        protocol.handshake(handshake);
        const text = "a".repeat(1000);
        const map = event(0, text.length, Array.from({ length: text.length }, (_, i) => i), text);
        const original = crypto.createHash;
        let calls = 0;
        try {
            crypto.createHash = function (...args) {
                calls++;
                return original.apply(this, args);
            };
            assert.strictEqual(protocol.acceptText(text, map), map);
            assert.strictEqual(calls, 1);
        } finally {
            crypto.createHash = original;
        }
    });

    for (const [label, invalid] of [
        ["missing map", null],
        ["truncated map", event(0, 3, [0])],
        ["out of order", event(1, 3, [0, 1])],
        ["descending offsets", event(0, 3, [1, 0])],
        ["out of stream", event(0, 1, [0, 1])],
        ["altered offsets with valid shape", { ...event(0, 4, [0, 1]), offsets: [0, 2] }],
        ["altered text", event(0, 3, [0, 1], "xy")]
    ]) {
        it(`disables navigation permanently for ${label}`, function () {
            const protocol = new SourceMapProtocol();
            assert.strictEqual(protocol.handshake(handshake), true);
            assert.strictEqual(protocol.acceptText("ab", invalid), null);
            assert.strictEqual(protocol.acceptText("ab", event(0, 3, [0, 1])), null);
        });
    }

    it("rejects incompatible and duplicate handshakes", function () {
        const incompatible = new SourceMapProtocol();
        assert.strictEqual(incompatible.handshake({ ...handshake, version: 2 }), false);
        assert.strictEqual(incompatible.acceptText("ab", event(0, 3, [0, 1])), null);
        const duplicate = new SourceMapProtocol();
        assert.strictEqual(duplicate.handshake(handshake), true);
        assert.strictEqual(duplicate.handshake(handshake), false);
        assert.strictEqual(duplicate.acceptText("ab", event(0, 3, [0, 1])), null);
    });
});
