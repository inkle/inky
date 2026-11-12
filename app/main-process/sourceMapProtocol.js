"use strict";

const crypto = require("crypto");

function checksum(text, sequence, streamEnd, offsets) {
    const bytes = Buffer.allocUnsafe(12 + text.length * 2 + offsets.length * 4);
    bytes.writeInt32LE(sequence, 0);
    bytes.writeInt32LE(streamEnd, 4);
    bytes.writeInt32LE(text.length, 8);
    for( let i = 0; i < text.length; i++ ) bytes.writeUInt16LE(text.charCodeAt(i), 12 + i * 2);
    const start = 12 + text.length * 2;
    for( let i = 0; i < offsets.length; i++ ) bytes.writeInt32LE(offsets[i], start + i * 4);
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

class SourceMapProtocol {
    constructor() {
        this.state = "waiting";
        this.sequence = 0;
        this.streamEnd = 0;
    }

    handshake(info) {
        if( this.state !== "waiting" || !info || info.version !== 1 ||
            info.unit !== "utf16" || info.compiler !== "ink-1.2.1" ) {
            this.state = "disabled";
            return false;
        }
        this.state = "active";
        return true;
    }

    acceptText(text, map) {
        if( this.state !== "active" || typeof text !== "string" ||
            !map || map.version !== 1 || map.unit !== "utf16" ||
            map.sequence !== this.sequence ||
            !Number.isInteger(map.streamEnd) || map.streamEnd > 0x7fffffff || map.streamEnd < this.streamEnd ||
            !Number.isInteger(map.sequence) || map.sequence > 0x7fffffff ||
            !Array.isArray(map.offsets) || map.offsets.length !== text.length ) {
            this.state = "disabled";
            return null;
        }
        let last = this.streamEnd - 1;
        for( const offset of map.offsets ) {
            if( !Number.isSafeInteger(offset) || offset <= last || offset >= map.streamEnd ) {
                this.state = "disabled";
                return null;
            }
            last = offset;
        }
        if( typeof map.checksum !== "string" ||
            map.checksum !== checksum(text, map.sequence, map.streamEnd, map.offsets) ) {
            this.state = "disabled";
            return null;
        }
        this.sequence++;
        this.streamEnd = map.streamEnd;
        return map;
    }
}

exports.SourceMapProtocol = SourceMapProtocol;
exports.checksum = checksum;
