const assert = require('node:assert/strict');
const { describe, it } = global.describe ? { describe: global.describe, it: global.it } : require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { formatText } = require('../renderer/codeFormat');

describe('Format Code', () => {
    it('cleans indentation and tags without rewriting narrative or Ink structure', () => {
        const input = '=== start ===\r\n\t* [Go  now]  \r\n\t\tHello  world.\r\n  # bg :forest.jpg\r\n-> END\r\n';
        assert.equal(formatText(input, 4), '=== start ===\r\n* [Go  now]\r\n    Hello  world.\r\n#bg: forest.jpg\r\n    -> END\r\n');
    });
    it('is idempotent and preserves blank lines, expressions, escapes and inline braces', () => {
        const input = 'VAR x = "a  b"\n\n{ x: Hello | Goodbye }\n\\#literal\n';
        assert.equal(formatText(input), input);
        assert.equal(formatText(formatText('\tHello  \n')), formatText('\tHello  \n'));
        assert.equal(formatText(''), '');
        assert.equal(formatText(' \ttext', 4), 'text');
    });
    it('offers formatting only when the context is an editable Ink editor', () => {
        const listeners = {}, sent = [];
        let editable = true, formatted = 0, changed = true, focused = 0;
        const notices = [];
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/contextmenu.js'), 'utf8'), {
            window: { addEventListener: (name, fn) => listeners[name] = fn, alert: text => notices.push(text) },
            require: name => name === 'electron' ? { ipcRenderer: {
                send: (...args) => sent.push(args), on: (name, fn) => listeners[name] = fn
            }} : { EditorView: { canFormatCode: () => editable, focus: () => focused++, formatCode: () => { formatted++; return changed; } } }
        });
        const event = inside => ({ target: { closest: () => inside }, preventDefault() {} });
        listeners.contextmenu(event(true));
        assert.equal(sent.pop()[1].formatCode, true);
        listeners.contextmenu(event(false));
        assert.equal(sent.pop()[1].formatCode, false);
        editable = false;
        listeners.contextmenu(event(true));
        assert.equal(sent.pop()[1].formatCode, false);
        listeners['format-code']();
        assert.equal(formatted, 0); // Session may have changed while the menu was open.
        editable = true;
        listeners['format-code']();
        assert.equal(formatted, 1);
        assert.equal(notices.length, 0);
        changed = false;
        listeners['format-code']();
        assert.deepEqual(notices, []);
        assert.equal(formatted, 2);
        assert.equal(focused, 2); // Both changed and unchanged code return focus silently.
        listeners.contextmenu({ defaultPrevented: true });
        assert.equal(sent.length, 0);
    });
    it('routes the native menu action back to the requesting window', () => {
        const source = fs.readFileSync(path.join(__dirname, '../main-process/main.js'), 'utf8');
        const handler = source.slice(source.indexOf("ipcMain.on('show-context-menu'"), source.indexOf('ipcMain.handle("showOpenDialog"'));
        let listener, template;
        const sent = [];
        vm.runInNewContext(handler, {
            ipcMain: { on: (_, fn) => listener = fn },
            Menu: { buildFromTemplate: items => { template = items; return { popup() {} }; } },
            BrowserWindow: { fromWebContents: sender => sender }
        });
        const event = { sender: { send: channel => sent.push(channel) } };
        listener(event, { formatCode: true });
        template.find(item => item.label === 'Format Code').click();
        assert.deepEqual(sent, ['format-code']);
        listener(event);
        assert.equal(template.some(item => item.label === 'Format Code'), false);
    });
});

it("formats through the actual bundled Ace session with single-step undo and redo", () => {
const context={console,setTimeout,clearTimeout,setInterval,clearInterval,navigator:{platform:'Linux',userAgent:'node',appName:'node'},window:null};
context.window=context;
vm.createContext(context);
let source=fs.readFileSync(path.join(__dirname, '../renderer/acesrc/ace.js'),'utf8');
// Load the bundled AMD modules without bootstrapping the browser renderer.
source=source.slice(0,source.lastIndexOf('(function()'));
vm.runInContext(source,context);

const Session=context.require('ace/edit_session').EditSession;
const Undo=context.require('ace/undomanager').UndoManager;
const Range=context.require('ace/range').Range;
const session=new Session('\tHello  \n-> END');session.setUndoManager(new Undo());
const selection=session.selection;
const editor={getReadOnly:()=>false,getSession:()=>session,selection,focus(){}};
const {formatEditor}=require('../renderer/codeFormat');
const before=session.getValue();
assert.equal(formatEditor(editor,Range),true);
assert.equal(session.getValue(),'Hello\n-> END');
session.getUndoManager().undo();assert.equal(session.getValue(),before);
session.getUndoManager().redo();assert.equal(session.getValue(),'Hello\n-> END');
assert.equal(formatEditor(editor,Range),false);

});

it('visibly fixes uneven spaces, nested choices, gathers, tags and knot boundaries', () => {
    const input = '     === start ===\n   * [First]\nNo indent\n#title: Locked left\n       * * [Nested]\nMore text\n    - - Rejoin\n          Continue\n  + [Second]\nText\n    - End\n      -> finish\n   === finish ===\n   Done.\n -> END\n';
    const expected = '=== start ===\n* [First]\n    No indent\n#title: Locked left\n    * * [Nested]\n        More text\n    - - Rejoin\n    Continue\n+ [Second]\n    Text\n- End\n-> finish\n=== finish ===\nDone.\n-> END\n';
    assert.equal(formatText(input, 4), expected);
    assert.equal(formatText(expected, 4), expected);
    assert.equal(formatText('* Choice\ntext', 2), '* Choice\n  text');
});

it('does not mistake conditional branches, comments or quoted braces for weave markers', () => {
    const input = '* Choice\n{ true:\n  - text\n    text\n}\n/*\n* fake choice\n{ comment\n*/\n"A { brace"\nnext\n';
    const expected = '* Choice\n{ true:\n  - text\n    text\n}\n/*\n* fake choice\n{ comment\n*/\n    "A { brace"\n    next\n';
    assert.equal(formatText(input), expected);
    assert.equal(formatText(expected), expected);
});

it('preserves compiled story output for branching and multiline Ink fixtures', () => {
    const os = require('node:os');
    const { execFileSync } = require('node:child_process');
    const suffix = { linux: 'linux', darwin: 'mac', win32: 'win.exe' }[process.platform];
    const compiler = path.join(__dirname, '../main-process/ink/inklecate_' + suffix);
    const fixtures = [
        '-> start\n   === start ===\n  * [First]\nText\n      * * [Nested]\nDeep\n  * * [Other]\nOther\n - - Continue\nNext\n   * [Second]\nSecond\n - End\n -> END\n',
        'VAR ready = true\n-> start\n=== start ===\n  + [Try]\n#title: Test\n{ ready:\n Yes.\n- else:\n No.\n}\n-> END\n  + [Leave]\n{stopping:\n - One.\n - Two.\n}\n-> END\n',
        '-> start\n=== start ===\n /*\n * fake choice\n */\n  * [Go]\nHello  world.\n-> finish\n === finish ===\n Goodbye.\n -> END\n'
    ];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-format-test-'));
    try {
        for (const input of fixtures) {
            const source = path.join(directory, 'story.ink');
            const output = path.join(directory, 'story.json');
            const compile = text => {
                fs.writeFileSync(source, text);
                execFileSync(compiler, ['-o', output, source], { stdio: 'pipe' });
                return JSON.parse(fs.readFileSync(output, 'utf8'));
            };
            const before = compile(input);
            const formatted = formatText(input);
            assert.notEqual(formatted, input);
            assert.deepEqual(compile(formatted), before);
            assert.equal(formatText(formatted), formatted);
        }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
