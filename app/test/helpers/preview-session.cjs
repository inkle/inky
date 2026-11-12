const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    let id = 0;
    const listeners = new Map();
    const pending = new Map();
    ws.on('message', data => {
        const message = JSON.parse(data);
        if (!message.id) {
            for (const callback of listeners.get(message.method) || []) callback(message.params);
            return;
        }
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        clearTimeout(entry.timeout);
        if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
        else entry.resolve(message.result);
    });
    return {
        on(method, callback) {
            if (!listeners.has(method)) listeners.set(method, []);
            listeners.get(method).push(callback);
        },
        send(method, params = {}) {
            return new Promise((resolve, reject) => {
                const next = ++id;
                const timeout = setTimeout(() => { pending.delete(next); reject(new Error('CDP timeout: ' + method)); }, 20000);
                pending.set(next, { resolve, reject, timeout });
                ws.send(JSON.stringify({ id: next, method, params }));
            });
        },
        close() { ws.close(); }
    };
}

async function launch({ binary, appPath, fixture, output, flags = [], viewSettings }) {
    fs.mkdirSync(output, { recursive: true });
    const profile = path.join(output, 'profile');
    if (viewSettings) {
        fs.mkdirSync(profile, { recursive: true });
        fs.writeFileSync(path.join(profile, 'view-settings.json'), JSON.stringify(viewSettings));
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const log = fs.openSync(path.join(output, 'application.log'), 'w');
    const child = spawn(binary, [...(appPath ? [appPath] : []), '--user-data-dir=' + profile,
        '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', ...flags, fixture],
        { env, stdio: ['ignore', log, log], detached: true });
    fs.closeSync(log);
    let renderer, browser;
    try {
        let port;
        for (let i = 0; i < 150; i++) {
            if (child.exitCode !== null) throw new Error('Electron exited: ' + child.exitCode);
            try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
            if (port) break;
            await sleep(200);
        }
        if (!port) throw new Error('No DevToolsActivePort; inspect application.log');
        let target;
        for (let i = 0; i < 150; i++) {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            target = targets.find(t => t.url.includes('/renderer/index.html'));
            if (target) break;
            await sleep(200);
        }
        if (!target) throw new Error('Editor did not open');
        renderer = await connect(target.webSocketDebuggerUrl);
        const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        browser = await connect(version.webSocketDebuggerUrl);
        async function evaluate(expression) {
            const result = await renderer.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        }
        async function until(expression) {
            for (let i = 0; i < 150; i++) {
                if (await evaluate(expression)) return;
                await sleep(100);
            }
            throw new Error('Timeout: ' + expression);
        }
        return { child, renderer, browser, evaluate, until, version,
            async close() {
                renderer.close(); browser.close();
                try { process.kill(-child.pid, 'SIGTERM'); } catch {}
                await sleep(300);
            }
        };
    } catch (error) {
        renderer?.close(); browser?.close();
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        throw error;
    }
}
module.exports = { launch, sleep };
