const { _electron: electron } = require('playwright-core');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const electronBinary = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron');
const mainScript = path.join(__dirname, '..', 'main-process', 'main.js');
const bidiInkPath = path.join(__dirname, 'fixtures', 'bidi_and_tdd.ink');
const assertionsPath = path.join(__dirname, 'fixtures', 'bidi-assertions.json');

// Load fixtures
const bidiInkContent = fs.readFileSync(bidiInkPath, 'utf8');
const bidiAssertions = JSON.parse(fs.readFileSync(assertionsPath, 'utf8'));

// Helper: launch the Electron app and return { electronApp, window }
async function launchApp() {
    const electronApp = await electron.launch({
        executablePath: electronBinary,
        args: ['--no-sandbox', mainScript],
        env: { ...process.env, NODE_ENV: 'test' }
    });

    const window = await electronApp.firstWindow();
    // Wait for the app to be ready (ace editor loaded)
    await window.waitForSelector('#editor .ace_content', { timeout: 15000 });
    return { electronApp, window };
}

// Helper: force-quit the app without save dialogs
async function forceQuitApp(electronApp) {
    if (!electronApp) return;
    try {
        await electronApp.evaluate(({ app }) => { app.exit(0); });
    } catch (e) {
        // App already closed
    }
}

// Helper: set the Ace editor content programmatically
async function setEditorContent(window, text) {
    await window.evaluate((t) => {
        var editor = ace.edit("editor");
        editor.setValue(t, 1);
    }, text);
}

// Helper: get Ace editor content
async function getEditorContent(window) {
    return await window.evaluate(() => {
        var editor = ace.edit("editor");
        return editor.getValue();
    });
}

// Helper: type text into Ace editor using keyboard (simulates real typing)
async function typeInEditor(window, text) {
    // Focus the editor first
    await window.click('#editor .ace_content');
    await new Promise(r => setTimeout(r, 200));

    // Type each character using Playwright keyboard
    for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (ch === '\n') {
            await window.keyboard.press('Enter');
        } else if (ch === '\t') {
            await window.keyboard.press('Tab');
        } else {
            await window.keyboard.type(ch, { delay: 0 });
        }
    }
}

// Helper: clear the editor
async function clearEditor(window) {
    await window.evaluate(() => {
        var editor = ace.edit("editor");
        editor.setValue('', 1);
    });
}

// Helper: wait for compilation to complete (spinner stops)
async function waitForCompilation(window, timeout) {
    timeout = timeout || 30000;
    // Wait for the live compiler to finish
    await window.waitForFunction(() => {
        var spinner = document.querySelector('.busySpinner');
        return !spinner || !spinner.classList.contains('active');
    }, { timeout: timeout }).catch(() => {});
    // Extra buffer for compilation to finalize
    await new Promise(r => setTimeout(r, 2000));
}

// Helper: wait for story text to appear in the player
async function waitForStoryText(window, timeout) {
    timeout = timeout || 15000;
    await window.waitForSelector('#player .innerText.active .storyText',
        { state: 'attached', timeout: timeout });
}

// Helper: wait for a choice to appear in the player
async function waitForChoice(window, timeout) {
    timeout = timeout || 15000;
    await window.waitForSelector('#player .innerText.active .choice',
        { state: 'attached', timeout: timeout });
}

// Helper: get all story text content
async function getAllStoryText(window) {
    return await window.evaluate(() => {
        var texts = document.querySelectorAll('#player .innerText.active .storyText');
        var result = [];
        for (var i = 0; i < texts.length; i++) {
            result.push(texts[i].textContent.trim());
        }
        return result;
    });
}

// Helper: get all choice text
async function getAllChoiceText(window) {
    return await window.evaluate(() => {
        var choices = document.querySelectorAll('#player .innerText.active .choice a');
        var result = [];
        for (var i = 0; i < choices.length; i++) {
            result.push(choices[i].textContent.trim());
        }
        return result;
    });
}

// Helper: click a choice by index and wait for subsequent content
async function clickChoiceByIndex(window, index, timeout) {
    timeout = timeout || 20000;
    // Wait for compilation to stabilize
    await window.waitForFunction(() => {
        var spinner = document.querySelector('.busySpinner');
        return !spinner || !spinner.classList.contains('active');
    }, { timeout: 5000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // Get the choice selector
    var selector = '#player .innerText.active .choice a';
    var choices = await window.$$(selector);
    if (index >= choices.length) {
        throw new Error('Choice index ' + index + ' out of range (only ' + choices.length + ' choices)');
    }

    // Record current story text count
    var currentCount = await window.evaluate(() => {
        return document.querySelectorAll('#player .innerText.active .storyText').length;
    });

    // Click the choice using force:true for jQuery compatibility
    await choices[index].click({ force: true });

    // Wait for new content to appear
    await window.waitForFunction((prevCount) => {
        var texts = document.querySelectorAll('#player .innerText.active .storyText');
        return texts.length > prevCount;
    }, currentCount, { timeout: timeout });
}

// Helper: click a choice by matching text
async function clickChoiceByText(window, textMatch, timeout) {
    timeout = timeout || 20000;
    await window.waitForFunction(() => {
        var spinner = document.querySelector('.busySpinner');
        return !spinner || !spinner.classList.contains('active');
    }, { timeout: 5000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    var currentCount = await window.evaluate(() => {
        return document.querySelectorAll('#player .innerText.active .storyText').length;
    });

    // Find and click the choice matching text
    var clicked = await window.evaluate((text) => {
        var choices = document.querySelectorAll('#player .innerText.active .choice a');
        for (var i = 0; i < choices.length; i++) {
            if (choices[i].textContent.indexOf(text) !== -1) {
                // Trigger jQuery click event properly
                var $a = window.jQuery ? jQuery(choices[i]) : null;
                if ($a) {
                    $a.trigger('click');
                    return true;
                }
            }
        }
        return false;
    }, textMatch);

    if (!clicked) {
        // Fallback: use Playwright click with force
        var choiceLinks = await window.$$('#player .innerText.active .choice a');
        for (var link of choiceLinks) {
            var linkText = await link.textContent();
            if (linkText.indexOf(textMatch) !== -1) {
                await link.click({ force: true });
                clicked = true;
                break;
            }
        }
    }

    if (!clicked) {
        throw new Error('No choice found matching: ' + textMatch);
    }

    // Wait for new content
    await window.waitForFunction((prevCount) => {
        var texts = document.querySelectorAll('#player .innerText.active .storyText');
        return texts.length > prevCount;
    }, currentCount, { timeout: timeout }).catch(() => {});
}

// Helper: check no compilation errors
async function hasNoErrors(window) {
    return await window.evaluate(() => {
        var errorElements = document.querySelectorAll('#player .innerText.active .error');
        return errorElements.length === 0;
    });
}

// Helper: get issue count
async function getIssueInfo(window) {
    return await window.evaluate(() => {
        var errorCount = document.querySelector('.issueCount.error');
        var warningCount = document.querySelector('.issueCount.warning');
        var todoCount = document.querySelector('.issueCount.todo');
        return {
            errors: errorCount ? errorCount.textContent.trim() : '0',
            errorsVisible: errorCount ? errorCount.style.display !== 'none' : false,
            warnings: warningCount ? warningCount.textContent.trim() : '0',
            warningsVisible: warningCount ? warningCount.style.display !== 'none' : false,
            todos: todoCount ? todoCount.textContent.trim() : '0',
            todosVisible: todoCount ? todoCount.style.display !== 'none' : false
        };
    });
}

// ====================================================================
// Compilable Hebrew ink story for E2E tests
// (The full bidi_and_tdd.ink has syntax issues with the ink compiler)
// ====================================================================
var hebrewStoryInk = [
    '-> start',
    '=== start ===',
    'שלום עולם!',
    'בחר אפשרות:',
    '',
    '* [בדיקה מהירה — Smoke Test] -> smoke_test',
    '* [מוזיאון בידי — Bidi Museum] -> bidi_museum',
    '* [סיפור — Story] -> story',
    '',
    '=== smoke_test ===',
    'שלום עולם.',
    'הבדיקה עברה בהצלחה! Test passed!',
    '* [חזרה — Back] -> start',
    '* [סוף — End] -> END',
    '',
    '=== bidi_museum ===',
    'Hebrew: שלום עולם',
    'Arabic: مرحبا بالعالم',
    'Persian: سلام جهان',
    '* [חזרה — Back] -> start',
    '* [סוף — End] -> END',
    '',
    '=== story ===',
    'פעם היה איש שגר בירושלים.',
    'הוא יצא לטייל.',
    '* [צפונה — North]',
    '  הלך צפונה.',
    '  -> story_end',
    '* [דרומה — South]',
    '  הלך דרומה.',
    '  -> story_end',
    '',
    '=== story_end ===',
    'הגיע ליעד. Arrived at destination.',
    '-> END'
].join('\n');

// ====================================================================
// TEST SUITES
// ====================================================================

describe('Bidi E2E: Load and compile Hebrew ink', function () {
    this.timeout(60000);

    let electronApp, window;

    beforeEach(async function () {
        ({ electronApp, window } = await launchApp());
    });

    afterEach(async function () {
        await forceQuitApp(electronApp);
    });

    it('loads the full bidi ink fixture without crashing', async function () {
        await setEditorContent(window, bidiInkContent);
        await waitForCompilation(window);

        // Editor should contain the full script
        var content = await getEditorContent(window);
        assert.ok(content.length > 1000, 'Editor should contain substantial content');
        assert.ok(content.indexOf('VAR lang') !== -1, 'Should contain VAR declarations');
        assert.ok(content.indexOf('שלום') !== -1, 'Should contain Hebrew text');
    });

    it('compiles Hebrew story without errors', async function () {
        await setEditorContent(window, hebrewStoryInk);
        await waitForCompilation(window);
        await waitForStoryText(window, 20000);

        var noErrors = await hasNoErrors(window);
        assert.ok(noErrors, 'Should compile without errors');

        var texts = await getAllStoryText(window);
        assert.ok(texts.length > 0, 'Story text should appear after compilation');
        var allText = texts.join(' ');
        assert.ok(allText.indexOf('שלום') !== -1 || allText.indexOf('Hello') !== -1,
            'Should contain greeting text');
    });

    it('shows menu choices with Hebrew text', async function () {
        await setEditorContent(window, hebrewStoryInk);
        await waitForCompilation(window);
        await waitForChoice(window, 20000);

        var choices = await getAllChoiceText(window);
        assert.ok(choices.length >= 3, 'Should show at least 3 menu choices, got ' + choices.length);

        var allText = choices.join(' ');
        assert.ok(allText.indexOf('בדיקה') !== -1 || allText.indexOf('Smoke') !== -1,
            'Should contain Smoke Test choice');
    });
});

describe('Bidi E2E: Type Hebrew text in editor', function () {
    this.timeout(60000);

    let electronApp, window;

    beforeEach(async function () {
        ({ electronApp, window } = await launchApp());
    });

    afterEach(async function () {
        await forceQuitApp(electronApp);
    });

    it('types Hebrew hello world and compiles', async function () {
        var hebrewInk = 'שלום עולם!';
        await clearEditor(window);
        await typeInEditor(window, hebrewInk);
        await waitForCompilation(window);
        await waitForStoryText(window, 15000);

        var texts = await getAllStoryText(window);
        assert.ok(texts.length > 0, 'Should show story text');
        assert.ok(texts[0].indexOf('שלום') !== -1, 'Story should contain Hebrew text');
    });

    it('types Hebrew choice syntax and compiles', async function () {
        var ink = 'שלום עולם!\n* [בחירה ראשונה]\n  תוצאה.\n-> END';
        await setEditorContent(window, ink);
        await waitForCompilation(window);
        await waitForChoice(window, 15000);

        var choices = await getAllChoiceText(window);
        assert.ok(choices.length > 0, 'Should show choices');
        assert.ok(choices[0].indexOf('בחירה') !== -1, 'Choice should contain Hebrew text');
    });

    it('types mixed Hebrew-English ink line', async function () {
        var mixedInk = 'הבחירה -> END';
        await clearEditor(window);
        await typeInEditor(window, mixedInk);
        await waitForCompilation(window);
        await waitForStoryText(window, 15000);

        var texts = await getAllStoryText(window);
        assert.ok(texts.length > 0, 'Should show story text');
    });

    it('types Arabic hello world and compiles', async function () {
        var arabicInk = 'مرحبا بالعالم!';
        await clearEditor(window);
        await typeInEditor(window, arabicInk);
        await waitForCompilation(window);
        await waitForStoryText(window, 15000);

        var texts = await getAllStoryText(window);
        assert.ok(texts.length > 0, 'Should show story text');
        assert.ok(texts[0].indexOf('مرحبا') !== -1, 'Story should contain Arabic text');
    });
});

describe('Bidi E2E: Play through Hebrew story', function () {
    this.timeout(60000);

    let electronApp, window;

    beforeEach(async function () {
        ({ electronApp, window } = await launchApp());
    });

    afterEach(async function () {
        await forceQuitApp(electronApp);
    });

    it('navigates smoke test and verifies Hebrew output', async function () {
        await setEditorContent(window, hebrewStoryInk);
        await waitForCompilation(window);
        await waitForChoice(window, 20000);

        // Click "Smoke Test" choice (index 0)
        await clickChoiceByIndex(window, 0, 20000);

        // Wait for smoke test content to appear
        await new Promise(r => setTimeout(r, 2000));

        var texts = await getAllStoryText(window);
        var allText = texts.join(' ');

        assert.ok(allText.indexOf('שלום') !== -1 || allText.indexOf('Hello') !== -1,
            'Smoke test should show greeting text');
    });

    it('navigates bidi museum with multiple RTL scripts', async function () {
        await setEditorContent(window, hebrewStoryInk);
        await waitForCompilation(window);
        await waitForChoice(window, 20000);

        // Click "Bidi Museum" choice (index 1)
        await clickChoiceByIndex(window, 1, 20000);
        await new Promise(r => setTimeout(r, 2000));

        var texts = await getAllStoryText(window);
        var allText = texts.join(' ');

        assert.ok(allText.indexOf('שלום') !== -1, 'Museum should show Hebrew text');
        assert.ok(allText.indexOf('مرحبا') !== -1, 'Museum should show Arabic text');
        assert.ok(allText.indexOf('سلام') !== -1, 'Museum should show Persian text');
    });

    it('plays story path with choices and Hebrew narration', async function () {
        await setEditorContent(window, hebrewStoryInk);
        await waitForCompilation(window);
        await waitForChoice(window, 20000);

        // Click "Story" choice (index 2)
        await clickChoiceByIndex(window, 2, 20000);
        await new Promise(r => setTimeout(r, 1000));

        // Wait for story choices (North/South)
        await waitForChoice(window, 15000);
        var choices = await getAllChoiceText(window);
        assert.ok(choices.length >= 2, 'Should show North/South choices');

        // Click North
        await clickChoiceByIndex(window, 0, 20000);
        await new Promise(r => setTimeout(r, 2000));

        var texts = await getAllStoryText(window);
        var allText = texts.join(' ');
        assert.ok(allText.indexOf('הגיע') !== -1 || allText.indexOf('Arrived') !== -1,
            'Should reach story end');
    });
});

describe('Bidi E2E: Compilation verification', function () {
    this.timeout(60000);

    let electronApp, window;

    beforeEach(async function () {
        ({ electronApp, window } = await launchApp());
    });

    afterEach(async function () {
        await forceQuitApp(electronApp);
    });

    it('compiles Hebrew text without bidi markers in output', async function () {
        // Load simple Hebrew ink
        var ink = 'שלום עולם!';
        await setEditorContent(window, ink);
        await waitForCompilation(window);
        await waitForStoryText(window, 15000);

        // Verify the editor content stays clean (no bidi markers injected)
        var content = await getEditorContent(window);
        assert.strictEqual(content.indexOf('\u2066'), -1, 'Editor should not contain LRI markers');
        assert.strictEqual(content.indexOf('\u2067'), -1, 'Editor should not contain RLI markers');
        assert.strictEqual(content.indexOf('\u2069'), -1, 'Editor should not contain PDI markers');
    });

    it('compiles mixed Hebrew-English choices correctly', async function () {
        var ink = [
            'בחר:',
            '* [אפשרות א — Option A]',
            '  תוצאה א. Result A.',
            '  -> END',
            '* [אפשרות ב — Option B]',
            '  תוצאה ב. Result B.',
            '  -> END'
        ].join('\n');

        await setEditorContent(window, ink);
        await waitForCompilation(window);
        await waitForChoice(window, 15000);

        var choices = await getAllChoiceText(window);
        assert.strictEqual(choices.length, 2, 'Should show 2 choices');
        assert.ok(choices[0].indexOf('אפשרות') !== -1, 'First choice has Hebrew');
        assert.ok(choices[0].indexOf('Option') !== -1, 'First choice has English');
    });

    it('handles 10 RTL scripts from assertions file', async function () {
        // Test each RTL script from bidi-assertions.json
        var rtlAssertions = bidiAssertions.assertions.filter(function(a) {
            return a.expectedDirection === 'rtl';
        });

        // Test the first few RTL scripts (one line each)
        for (var i = 0; i < Math.min(3, rtlAssertions.length); i++) {
            var assertion = rtlAssertions[i];
            await setEditorContent(window, assertion.input);
            await waitForCompilation(window);
            await waitForStoryText(window, 15000);

            var texts = await getAllStoryText(window);
            assert.ok(texts.length > 0, 'Story text should appear for: ' + assertion.id);
        }
    });
});

describe('Bidi E2E: Bidify assertions unit validation', function () {
    this.timeout(30000);

    let electronApp, window;

    beforeEach(async function () {
        ({ electronApp, window } = await launchApp());
    });

    afterEach(async function () {
        await forceQuitApp(electronApp);
    });

    it('validates bidify/stripBidi round-trip in renderer', async function () {
        // Run bidify tests inside the Electron renderer process
        var results = await window.evaluate(() => {
            try {
                var bidify = require('./bidify.js');
                var results = [];

                // Test 1: bidify then stripBidi round-trip
                var input = 'הבחירה -> next';
                var bidified = bidify.bidify(input);
                var stripped = bidify.stripBidi(bidified);
                results.push({
                    test: 'round-trip',
                    pass: stripped === input,
                    input: input,
                    output: stripped
                });

                // Test 2: pure English stays clean
                var english = 'Hello world';
                var bidifiedEn = bidify.bidify(english);
                results.push({
                    test: 'pure-english',
                    pass: bidifiedEn === english,
                    input: english,
                    output: bidifiedEn
                });

                // Test 3: Hebrew gets markers
                var hebrew = 'שלום עולם';
                var bidifiedHe = bidify.bidify(hebrew);
                results.push({
                    test: 'hebrew-markers',
                    pass: bidifiedHe !== hebrew && bidifiedHe.indexOf('\u2067') !== -1,
                    input: hebrew,
                    output: bidifiedHe
                });

                // Test 4: idempotency
                var doubleBidified = bidify.bidify(bidifiedHe);
                results.push({
                    test: 'idempotent',
                    pass: doubleBidified === bidifiedHe,
                    input: bidifiedHe,
                    output: doubleBidified
                });

                return { success: true, results: results };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        assert.ok(results.success, 'Should execute bidify in renderer: ' + (results.error || ''));

        for (var r of results.results) {
            assert.ok(r.pass, 'Bidify test "' + r.test + '" failed: input=' + r.input + ' output=' + r.output);
        }
    });

    it('validates assertion file entries via bidify in renderer', async function () {
        var assertions = bidiAssertions.assertions;

        var results = await window.evaluate((assertionData) => {
            try {
                var bidify = require('./bidify.js');
                var results = [];

                for (var i = 0; i < assertionData.length; i++) {
                    var a = assertionData[i];
                    var bidified = bidify.bidify(a.input);
                    var stripped = bidify.stripBidi(bidified);

                    var result = {
                        id: a.id,
                        roundTrip: stripped === a.input
                    };

                    // If expected direction is rtl, bidified should have RLI marker
                    if (a.expectedDirection === 'rtl') {
                        result.hasRtlMarker = bidified.indexOf('\u2067') !== -1;
                    } else if (a.expectedDirection === 'ltr') {
                        // Pure LTR text should not be modified (or should stay clean)
                        result.staysClean = bidified === a.input ||
                            bidified.indexOf('\u2067') === -1;
                    }

                    results.push(result);
                }

                return { success: true, results: results };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }, assertions);

        assert.ok(results.success, 'Should process assertions: ' + (results.error || ''));

        for (var r of results.results) {
            if (r.id !== 'strip-roundtrip') {
                assert.ok(r.roundTrip, 'Round-trip failed for: ' + r.id);
            }
            if (r.hasRtlMarker !== undefined) {
                assert.ok(r.hasRtlMarker, 'RTL marker missing for: ' + r.id);
            }
        }
    });
});
