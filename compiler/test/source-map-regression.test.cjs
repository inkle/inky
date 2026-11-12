const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const app = path.resolve(__dirname, "../../app");
const original = path.join(app, "main-process/ink/inklecate_linux");
const proof = process.env.INKY_SOURCE_MAP_COMPILER;
if (!proof || !path.isAbsolute(proof))
    throw new Error("Set INKY_SOURCE_MAP_COMPILER to the absolute path of the experimental compiler");
const { TagFormat } = require(path.join(app, "renderer/tagFormat"));
const spacing = require(path.join(app, "renderer/paragraphSpacing"));
const { SourceMapProtocol } = require(path.join(app, "main-process/sourceMapProtocol"));
const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), "inky-source-map-"));
after(() => fs.rmSync(fixtures, { recursive: true, force: true }));

function annotate(source) {
    return spacing.annotate(TagFormat.normalizeText(source));
}

class Session {
    constructor(command, args) {
        this.child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
        this.buffer = "";
        this.queue = [];
        this.waiter = null;
        this.stderr = "";
        this.failure = null;
        this.child.stderr.on("data", data => { this.stderr += data; });
        this.child.on("error", error => this.fail(error));
        this.child.on("exit", (code, signal) => this.fail(new Error(`compiler exited ${code}/${signal}: ${this.stderr}`)));
        this.child.stdout.setEncoding("utf8");
        this.child.stdout.on("data", data => {
            this.buffer += data.replace(/^\uFEFF/, "");
            while (true) {
                this.buffer = this.buffer.trimStart();
                if (!this.buffer.startsWith("{")) break;
                let depth = 0, quoted = false, escaped = false, end = -1;
                for (let i = 0; i < this.buffer.length; i++) {
                    const c = this.buffer[i];
                    if (quoted) {
                        if (escaped) escaped = false;
                        else if (c === "\\") escaped = true;
                        else if (c === '"') quoted = false;
                    } else if (c === '"') quoted = true;
                    else if (c === "{") depth++;
                    else if (c === "}" && --depth === 0) { end = i + 1; break; }
                }
                if (end < 0) break;
                const item = JSON.parse(this.buffer.slice(0, end));
                this.buffer = this.buffer.slice(end);
                if (this.waiter) {
                    const waiter = this.waiter;
                    this.waiter = null;
                    waiter.resolve(item);
                } else this.queue.push(item);
            }
        });
    }
    fail(error) {
        this.failure = error;
        if (this.waiter) {
            this.waiter.reject(error);
            this.waiter = null;
        }
    }
    async next() {
        if (this.queue.length) return this.queue.shift();
        if (this.failure) throw this.failure;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiter = null;
                reject(new Error(`timed out waiting for compiler: ${this.stderr}`));
            }, 20000);
            this.waiter = {
                resolve: value => { clearTimeout(timer); resolve(value); },
                reject: error => { clearTimeout(timer); reject(error); }
            };
        });
    }
    send(input) { this.child.stdin.write(`${input}\n`); }
    close() { this.child.kill(); }
}

async function play(command, args, choices, offsets) {
    const session = new Session(command, args);
    const events = [];
    try {
        let choiceIndex = 0;
        for (;;) {
            const event = await session.next();
            if (event.issues && event.issues.length) throw new Error(JSON.stringify(event.issues));
            if (event.needInput) {
                assert.ok(choiceIndex < choices.length, "unexpected choice prompt");
                session.send(choices[choiceIndex++]);
            } else if (event.end) {
                assert.equal(choiceIndex, choices.length);
                break;
            } else events.push(event);
        }
        const queryOffsets = typeof offsets === "function" ? offsets(events) : offsets;
        const replies = [];
        for (const offset of queryOffsets) {
            session.send(`DebugSource(${offset})`);
            for (;;) {
                const event = await session.next();
                if (event.cmdOutput !== undefined) {
                    replies.push(event.cmdOutput);
                    break;
                }
                assert.ok(event.needInput || (event.choices && event.choices.length === 0), JSON.stringify(event));
            }
        }
        return { events, offsets: queryOffsets, replies };
    } finally {
        session.close();
    }
}

function selectOffsets(events) {
    const picked = new Set();
    for (const event of events) {
        if (!event.text) continue;
        assert.equal(event.sourceMap.version, 1);
        assert.equal(event.sourceMap.unit, "utf16");
        const sourceOffsets = event.sourceMap.offsets;
        assert.equal(sourceOffsets.length, event.text.length);
        const words = [...event.text.matchAll(/\S+/gu)];
        for (const word of [words[0], words[Math.floor(words.length / 2)], words[words.length - 1]]) {
            if (word) picked.add(sourceOffsets[word.index + Math.floor(word[0].length / 2)]);
        }
        for (const word of event.text.matchAll(/Repetida|Destination|incluído|42/gu))
            picked.add(sourceOffsets[word.index + Math.floor(word[0].length / 2)]);
        for (let i = 0; i < event.text.length; i++) {
            if (!/\s/.test(event.text[i])) picked.add(sourceOffsets[i]);
        }
    }
    return [...picked];
}

async function compare(name, files, choices) {
    const dir = path.join(fixtures, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [filename, source] of Object.entries(files))
        fs.writeFileSync(path.join(dir, filename), annotate(source));
    const sourcePath = path.join(dir, "main.ink");
    const p = await play(proof, ["-ckjp", sourcePath], choices, selectOffsets);
    assert.ok(p.offsets.length > 0);
    const b = await play(original, ["-ckjp", sourcePath], choices, p.offsets);
    const protocol = new SourceMapProtocol();
    assert.ok(protocol.handshake(p.events.find(event => event.sourceMapProtocol).sourceMapProtocol));
    for (const event of p.events)
        if (event.text !== undefined) assert.ok(protocol.acceptText(event.text, event.sourceMap));
    const strip = event => {
        const { sourceMap, ...rest } = event;
        return rest;
    };
    assert.deepEqual(p.events.filter(event => !event.sourceMapProtocol).map(strip), b.events);
    assert.deepEqual(p.replies, b.replies);
    assert.ok(p.replies.every(reply => reply.startsWith("DebugSource: line ")), JSON.stringify(p.replies));
    return p;
}

test("C# 1.2.1: indistinguishable choice events retain their different actual offsets", async () => {
    const prefix = "-> start\n=== start ===\nStart.\n";
    const suffix = "\n=== dest ===\n#title: End\nDestination.\n-> END\n";
    const inline = await compare("inline", { "main.ink": prefix + "+ [Choose] -> dest\n" + suffix }, [1]);
    const newline = await compare("newline", { "main.ink": prefix + "+ [Choose]\n  -> dest\n" + suffix }, [1]);
    const a = inline.events.find(event => event.text && event.text.includes("Destination"));
    const b = newline.events.find(event => event.text && event.text.includes("Destination"));
    assert.equal(a.text, b.text);
    assert.equal(a.sourceMap.offsets[a.text.indexOf("Destination")], 18);
    assert.equal(b.sourceMap.offsets[b.text.indexOf("Destination")], 17);
});

test("C# 1.2.1: real long scene, repeated words, choices and consecutive blank lines", async t => {
    const source = fs.readFileSync(path.join(__dirname, "fixtures/long-scene.ink"), "utf8")
        .replace("Este é um parágrafo adicional", "Repetida Repetida Este é um parágrafo adicional");
    const result = await compare("long-scene", { "main.ink": source }, [1, 1, 2]);
    const paragraph = result.events.find(event => event.text && event.text.startsWith("Repetida Repetida"));
    assert.ok(paragraph);
    const last = paragraph.sourceMap.offsets[paragraph.text.indexOf("texto.") + 3];
    const index = result.offsets.indexOf(last);
    assert.ok(index >= 0);
    assert.match(result.replies[index], /line 60 /);
    assert.ok(result.events.some(event => event.tags && event.tags.some(tag => tag.includes("16"))));
    t.diagnostic(`repeated fixture: last word offset ${last}: ${result.replies[index]}; ${result.offsets.length} distinct offsets queried in each compiler`);
});

test("C# 1.2.1: original long-scene last word", async t => {
    const source = fs.readFileSync(path.join(__dirname, "fixtures/long-scene.ink"), "utf8");
    const result = await compare("long-scene-original", { "main.ink": source }, [1, 1, 2]);
    const paragraph = result.events.find(event => event.text && event.text.startsWith("Este é um parágrafo adicional"));
    assert.ok(paragraph);
    const last = paragraph.sourceMap.offsets[paragraph.text.indexOf("texto.") + 3];
    const index = result.offsets.indexOf(last);
    assert.ok(index >= 0);
    assert.match(result.replies[index], /line 60 /);
    t.diagnostic(`original fixture: last word offset ${last}: ${result.replies[index]}; ${result.offsets.length} distinct offsets queried in each compiler`);
});

test("C# 1.2.1: dynamic text, glue, tags, INCLUDE and edited recompilation", async t => {
    const main = "VAR count = 42\nINCLUDE chapter.ink\n-> start\n=== start ===\n# title: Dynamic\nBefore {count} <> joined.\n\n+ {count >= 42} [Continue] -> included\n+ {count < 0} [Hidden] -> included\n";
    const chapter = "=== included ===\n# title: Included\nTexto incluído com {count} e Repetida Repetida. 😀\n-> END\n";
    const first = await compare("dynamic", { "main.ink": main, "chapter.ink": chapter }, [1]);
    const included = first.events.find(event => event.text && event.text.includes("incluído"));
    assert.ok(included && included.text.includes("42"));
    const emoji = included.text.indexOf("😀");
    assert.ok(emoji >= 0);
    assert.equal(included.sourceMap.offsets[emoji + 1], included.sourceMap.offsets[emoji] + 1);
    t.diagnostic("dynamic included paragraph mapped by protocol v1");
    const edited = await compare("dynamic-edited", { "main.ink": main.replace("42", "73"), "chapter.ink": chapter }, [1]);
    assert.ok(edited.events.some(event => event.text && event.text.includes("73")));
    assert.ok(first.replies.some(reply => reply.includes("chapter.ink")));
});
