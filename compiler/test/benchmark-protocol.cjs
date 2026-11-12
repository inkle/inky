const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const experimental = process.env.INKY_SOURCE_MAP_COMPILER;
if (!experimental || !path.isAbsolute(experimental))
    throw new Error("INKY_SOURCE_MAP_COMPILER must be the absolute path to the v1 compiler");
const original = path.resolve(__dirname, "../../app/main-process/ink/inklecate_linux");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "inky-benchmark-"));
const repetitions = Number(process.env.INKY_BENCH_REPETITIONS || 3);
if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("Invalid repetition count");
const cases = { small: 4, medium: 120, large: 800 };

function source(lines) {
    const row = "Repeated flowing Ink narrative with choices and text for a reproducible paragraph. ".repeat(3);
    return `-> start\n=== start ===\n${Array(lines).fill(row).join("\n")}\n+ [Continue] -> finish\n=== finish ===\nThe final scene.\n-> END\n`;
}

function run(binary, file) {
    return new Promise((resolve, reject) => {
        const start = process.hrtime.bigint();
        const elapsed = () => Number(process.hrtime.bigint() - start) / 1e6;
        const child = spawn(binary, ["-ckjp", file]);
        let buffer = "", stderr = "", firstTextMs = null, choiceMs = null;
        let events = 0, textUnits = 0, totalBytes = 0, mapBytes = 0, peakRssKb = 0;
        const timer = setTimeout(() => { child.kill(); reject(new Error("Benchmark timed out")); }, 120000);
        const memory = setInterval(() => {
            try {
                const status = fs.readFileSync(`/proc/${child.pid}/status`, "utf8");
                const match = status.match(/^VmRSS:\s+(\d+)/m);
                if (match) peakRssKb = Math.max(peakRssKb, Number(match[1]));
            } catch (error) {
                if (error.code !== "ENOENT") { clearInterval(memory); child.kill(); reject(error); }
            }
        }, 20);
        child.on("error", reject);
        child.stderr.on("data", data => { stderr += data; });
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", data => {
            totalBytes += Buffer.byteLength(data);
            buffer += data.replace(/^\uFEFF/, "");
            while (true) {
                buffer = buffer.trimStart();
                if (!buffer.startsWith("{")) break;
                let depth = 0, quote = false, escape = false, end = -1;
                for (let i = 0; i < buffer.length; i++) {
                    const c = buffer[i];
                    if (quote) {
                        if (escape) escape = false;
                        else if (c === "\\") escape = true;
                        else if (c === '"') quote = false;
                    } else if (c === '"') quote = true;
                    else if (c === "{") depth++;
                    else if (c === "}" && --depth === 0) { end = i + 1; break; }
                }
                if (end < 0) break;
                const event = JSON.parse(buffer.slice(0, end));
                buffer = buffer.slice(end);
                if (event.issues && event.issues.length) { child.kill(); reject(new Error(JSON.stringify(event.issues))); return; }
                if (event.text !== undefined) {
                    if (firstTextMs === null) firstTextMs = elapsed();
                    events++;
                    textUnits += event.text.length;
                    if (event.sourceMap) mapBytes += Buffer.byteLength(JSON.stringify(event.sourceMap));
                }
                if (event.needInput && choiceMs === null) {
                    choiceMs = elapsed();
                    child.stdin.write("1\n");
                }
                if (event.end) {
                    const totalMs = elapsed();
                    clearTimeout(timer);
                    clearInterval(memory);
                    child.kill();
                    if (stderr) return reject(new Error(stderr));
                    resolve({ firstTextMs, choiceMs, totalMs, events, textUnits, totalBytes, mapBytes, peakRssKb });
                    return;
                }
            }
        });
    });
}

(async () => {
    try {
        for (const [name, lines] of Object.entries(cases)) {
            const file = path.join(root, `${name}.ink`);
            fs.writeFileSync(file, source(lines));
            for (let iteration = 0; iteration < repetitions; iteration++) {
                for (const [kind, binary] of [["baseline", original], ["v1", experimental]]) {
                    console.log(JSON.stringify({ name, lines, iteration, kind, ...(await run(binary, file)) }));
                }
            }
        }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
