// Regression for the Single theme menu visibility and compact mode selector.
// Does not require Electron, jsdom or a browser. The CSS selectors are also
// checked for computed cascade priority in test_theme75_css.py when packaging.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { GameStyle } = require('../renderer/gameStyle.js');
const root = path.join(__dirname, '..');

const m = GameStyle.defaultModel();
assert.strictEqual(m.themeMode, 'single');
assert.strictEqual(GameStyle.modelToStyle(m).controls.themeToggle, false);
assert.strictEqual(GameStyle.modelToStyle(m).alternate, null);
GameStyle.setThemeMode(m, 'dual');
assert.strictEqual(GameStyle.modelToStyle(m).controls.themeToggle, true);
assert.ok(GameStyle.modelToStyle(m).alternate);
GameStyle.setThemeMode(m, 'single');
assert.strictEqual(GameStyle.modelToStyle(m).controls.themeToggle, false);
assert.strictEqual(GameStyle.modelToStyle(m).alternate, null);
assert.strictEqual(GameStyle.parseText(GameStyle.toYaml(m)).style.controls.themeToggle, false);

// Explicitly single wins, even if someone kept an old theme_toggle: true key.
const single = GameStyle.parseText('theme_mode: single\ncontrols:\n  show: true\n  theme_toggle: true\n');
assert.strictEqual(single.model.themeMode, 'single');
assert.strictEqual(single.style.controls.themeToggle, false);
assert.strictEqual(single.style.alternate, null);

// Legacy projects without theme_mode still migrate their explicit toggle.
const legacy = GameStyle.parseText('controls:\n  show: true\n  theme_toggle: true\n');
assert.strictEqual(legacy.model.themeMode, 'dual');
assert.strictEqual(legacy.style.controls.themeToggle, true);

const previewCss = fs.readFileSync(path.join(root, 'renderer/gameChrome.css'), 'utf8');
const exportCss = fs.readFileSync(path.join(root, 'export-for-web-template/style.css'), 'utf8');
const editorCss = fs.readFileSync(path.join(root, 'renderer/gameSettings/gameSettings.css'), 'utf8');
const chromeJs = fs.readFileSync(path.join(root, 'renderer/gameChrome.js'), 'utf8');
assert.match(previewCss, /#main #player #story-menu > button\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(exportCss, /#story-menu > button\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(editorCss, /#appearance > #theme-mode,\s*#appearance #edit-theme,\s*#presentation-settings #presentation-mode\s*\{[^}]*width:\s*max-content;/);
assert.match(chromeJs, /player\.dataset\.themeToggle === "1" && actions\.onToggleTheme/);
console.log('PASS single mode hides the menu switch, dual mode shows it, and theme-mode buttons are compact');
