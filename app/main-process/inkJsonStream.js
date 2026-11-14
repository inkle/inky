"use strict";

// inklecate writes a stream of JSON objects. A single stdout chunk or line can
// contain several adjacent objects, and an object may span several chunks.
// Identify frame boundaries without treating braces inside JSON strings as syntax.
class InkJsonStream {
    constructor(onMalformed) {
        this.onMalformed = onMalformed || (() => {});
        this.reset();
    }

    reset() {
        this.buffer = "";
        this.depth = 0;
        this.inString = false;
        this.escaped = false;
        this.collecting = false;
    }

    push(chunk) {
        const messages = [];
        for (const ch of chunk) {
            if (!this.collecting) {
                if (/\s|\uFEFF/.test(ch)) continue;
                if (ch !== "{") {
                    this.onMalformed(ch);
                    continue;
                }
                this.collecting = true;
            }
            this.buffer += ch;
            if (this.inString) {
                if (this.escaped) this.escaped = false;
                else if (ch === "\\") this.escaped = true;
                else if (ch === '"') this.inString = false;
            } else if (ch === '"') {
                this.inString = true;
            } else if (ch === "{") {
                this.depth++;
            } else if (ch === "}") {
                this.depth--;
            }

            if (this.depth === 0) {
                const frame = this.buffer;
                this.reset();
                try {
                    const parsed = JSON.parse(frame);
                    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                        messages.push(parsed);
                    else
                        this.onMalformed(frame);
                } catch (error) {
                    this.onMalformed(frame);
                }
            }
        }
        return messages;
    }
}

module.exports = { InkJsonStream };
