// Node-only regression tests for the independent theme configuration.
"use strict";
const assert = require("assert");
const { GameStyle: G } = require("../renderer/gameStyle.js");
function test(name, run) { run(); console.log("PASS", name); }

test("single mode remains the default", () => {
    const m = G.defaultModel();
    assert.strictEqual(m.themeMode, "single");
    assert.strictEqual(G.modelToStyle(m).alternate, null);
    assert.match(G.toYaml(m), /^theme: light$/m);
});
test("legacy toggle and paired presets load without any warnings", () => {
    const old = G.parseText('theme: light\ntheme_family: sepia-terminal\ncolors:\n  background: "#dfdfdf"\ncontrols:\n  show: true\n  theme_toggle: true\n');
    assert.deepStrictEqual(old.warnings, []);
    assert.strictEqual(old.model.themeMode,"dual");
    assert.strictEqual(old.model.themes.light.colors.background,"#dfdfdf");
    assert.strictEqual(old.model.themes.dark.colors.background,"#000000");
    assert.strictEqual(old.style.alternate.theme,"dark");
});
test("legacy show=false still hides old toggle", () => {
    const old = G.parseText('controls:\n  show: false\n  theme_toggle: true\n');
    assert.strictEqual(old.style.alternate,null);
    assert.strictEqual(old.model.controls.themeToggle,true);
});
test("dual mode independently retains colors, hover and font sizes", () => {
    const m = G.defaultModel();
    G.setThemeMode(m,"dual");
    const light = { colors: { background:"#fefefe", text:"#111111", choice:"#123abc",choiceHover:"#456def" },fontFamily:"serif",fontSize:16 };
    const dark = { colors: { background:"#0a0a0a", text:"#eeeeee", choice:"#aaccff",choiceHover:null },fontFamily:"mono",fontSize:26 };
    G.setThemeLook(m,"light",light);
    G.setThemeLook(m,"dark",dark);
    const yaml=G.toYaml(m);
    assert.match(yaml,/^theme_mode: dual$/m);
    assert.doesNotMatch(yaml,/^colors:/m);
    assert.doesNotMatch(yaml,/^  theme_toggle:/m);
    const parsed=G.parseText(yaml);
    assert.deepStrictEqual(parsed.warnings,[]);
    assert.deepStrictEqual(parsed.model.themes.light,light);
    assert.deepStrictEqual(parsed.model.themes.dark,dark);
    assert.strictEqual(parsed.style.font.size,16);
    assert.strictEqual(parsed.style.alternate.font.size,26);
    assert.match(G.exportCss(parsed.style),/--font-size: 26px;/);
    assert.match(G.exportCss(parsed.style),/--bg: #0a0a0a;/);
});
test("dark initial theme uses the dark values first", () => {
    let m = G.defaultModel();
    G.setThemeMode(m,"dual");
    G.setThemeLook(m,"dark",{ colors:{...m.themes.dark.colors,background:"#010203"},fontFamily:"serif",fontSize:23});
    const yaml=G.toYaml(m).replace("theme: light", "theme: dark");
    const back=G.parseText(yaml);
    assert.strictEqual(back.style.colors.background,"#010203");
    assert.strictEqual(back.style.font.size,23);
    assert.strictEqual(back.style.alternate.colors.background,"#ffffff");
});
test("dual switch works without restart/save controls", () => {
    const m=G.defaultModel();
    G.setThemeMode(m,"dual");
    m.controls.show=false;
    const st=G.modelToStyle(m);
    assert.strictEqual(st.controls.themeToggle,true);
    assert.ok(st.alternate);
    assert.match(G.exportCss(st),/#story-menu #rewind/);
});
test("presets edit only their side and keep customized sizes", () => {
    const m=G.defaultModel();G.setThemeMode(m,"dual");
    const before={...m.themes.light.colors};
    G.setThemeLook(m,"dark",{...m.themes.dark,fontSize:29});
    G.applyThemePreset(m,"dark","terminal");
    assert.strictEqual(m.themes.dark.fontSize,29);
    assert.strictEqual(m.themes.dark.colors.background,"#000000");
    assert.deepStrictEqual(m.themes.light.colors,before);
});
test("dual to single mode keeps primary styling", () => {
    const m=G.defaultModel();G.setThemeMode(m,"dual");
    G.setThemeLook(m,"light",{...m.themes.light, colors:{...m.themes.light.colors,choice:"#555555"}});
    G.setThemeMode(m,"single");
    assert.strictEqual(m.colors.choice,"#555555");
    assert.strictEqual(G.modelToStyle(m).alternate,null);
    const back=G.parseText(G.toYaml(m));
    assert.deepStrictEqual(back.warnings,[]);
    assert.strictEqual(back.model.colors.choice,"#555555");
});
test("unknown and invalid dual theme fields are safely warned", () => {
    const x=G.parseText('theme_mode: dual\nthemes:\n  dark:\n    weird: true\n    size: 700\n    colors:\n      text: "not-a-color;"\n');
    assert.ok(x.warnings.some(w => w.includes("weird")));
    assert.ok(x.warnings.some(w => w.includes("size")));
    assert.ok(x.warnings.some(w => w.includes("text")));
    assert.strictEqual(x.model.themes.dark.fontSize,18);
});
console.log("Theme mode regression checks complete.");
