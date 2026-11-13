// Run against an isolated Electron window started with --remote-debugging-port.
const http = require("node:http");
const fs = require("node:fs");
const WebSocket = require("../../app/node_modules/ws");

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1) throw new Error("Provide the debugging port");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const targets = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, response => {
            let body = "";
            response.on("data", chunk => body += chunk);
            response.on("end", () => resolve(JSON.parse(body)));
        }).on("error", reject);
    });
    const ws = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    let id = 0;
    const pending = new Map();
    ws.on("message", data => {
        const reply = JSON.parse(data);
        const request = pending.get(reply.id);
        if (!request) return;
        pending.delete(reply.id);
        if (reply.error) request.reject(new Error(JSON.stringify(reply.error)));
        else request.resolve(reply.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const key = ++id;
        pending.set(key, { resolve, reject });
        ws.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => {
        const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    try {
        await send("Performance.enable");
        const cases = [
            ["small", 4, 0], ["medium", 120, 0],
            ["medium", 120, 1], ["medium", 120, 2], ["medium", 120, 3],
            ["large", 800, 0]
        ];
        for (const [name, lines, iteration] of process.env.INKY_BENCH_LARGE_ONLY ? cases.slice(-1) : cases) {
            const marker = `Benchmark ${name} ${iteration}`;
            const row = "Repeated flowing Ink narrative with choices and text for a reproducible paragraph. ".repeat(3);
            const source = `-> start\n=== start ===\n${marker}\n${Array(lines).fill(row).join("\n")}\n+ [Continue] -> finish\n=== finish ===\nThe final scene.\n-> END\n`;
            if (name === "large" && process.env.INKY_BENCH_PROFILE) {
                await send("Profiler.enable");
                await send("Profiler.start");
            }
            const started = Date.now();
            await evaluate(`(() => {
                if (window.__benchmarkHeartbeat) clearInterval(window.__benchmarkHeartbeat);
                window.__benchmarkLag = 0;
                let last = performance.now();
                window.__benchmarkHeartbeat = setInterval(() => {
                    const now = performance.now();
                    window.__benchmarkLag = Math.max(window.__benchmarkLag, now - last - 50);
                    last = now;
                }, 50);
                ace.edit("editor").setValue(${JSON.stringify(source)}, -1);
            })()`);
            let ready = false;
            while (Date.now() - started < 120000) {
                await delay(100);
                ready = await evaluate(`(() => {
                    const frame = document.querySelector("#player .innerText.active");
                    return !!frame && frame.textContent.includes(${JSON.stringify(marker)}) &&
                        [...frame.querySelectorAll(".choice-button")].some(button => button.textContent.trim() === "Continue");
                })()`);
                if (ready) break;
            }
            if (!ready) throw new Error(`${name} compilation did not finish in 120 seconds`);
            const readyMs = Date.now() - started;
            await delay(500);
            const stats = await evaluate(`(async () => {
                clearInterval(window.__benchmarkHeartbeat);
                const frame = document.querySelector("#player .innerText.active");
                const memory = await process.getProcessMemoryInfo();
                return { lagMs: window.__benchmarkLag, paragraphs: frame.querySelectorAll("p.storyText").length,
                    textUnits: frame.textContent.length, memory };
            })()`);
            const dom = await send("Memory.getDOMCounters");
            const metrics = await send("Performance.getMetrics");
            const heap = metrics.metrics.find(metric => metric.name === "JSHeapUsedSize").value;
            console.log(JSON.stringify({ name, lines, iteration, readyMs, ...stats, dom, heap }));
            if (name === "large" && process.env.INKY_BENCH_PROFILE) {
                const profile = await send("Profiler.stop");
                fs.writeFileSync(process.env.INKY_BENCH_PROFILE, JSON.stringify(profile.profile));
            }
        }
    } finally {
        ws.terminate();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
