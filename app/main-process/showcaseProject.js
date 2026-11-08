"use strict";
const fs = require("fs");
const path = require("path");
const TITLE = "Before Dawn";
const ENTRY = TITLE + ".ink";
const TEMPLATE = path.join(__dirname, "../resources/showcase/before-dawn");

// read/write also work when the template is bundled inside app.asar.
function copyTree(source, target) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(target, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(to);
            copyTree(from, to);
        } else if (entry.isFile()) {
            fs.writeFileSync(to, fs.readFileSync(from), { flag: "wx" });
        } else {
            throw new Error("Unexpected entry in showcase template: " + entry.name);
        }
    }
}
function createShowcaseProject(parent, template = TEMPLATE) {
    if (!fs.existsSync(path.join(template, ENTRY))) throw new Error("Showcase story is missing.");
    fs.mkdirSync(parent, { recursive: true });
    let target;
    for (let copy = 1; ; copy++) {
        target = path.join(parent, TITLE + (copy === 1 ? "" : " (" + copy + ")"));
        try { fs.mkdirSync(target); break; }
        catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    try { copyTree(template, target); }
    catch (error) { fs.rmSync(target, { recursive: true, force: true }); throw error; }
    return path.join(target, ENTRY);
}
module.exports = { createShowcaseProject, TITLE, ENTRY, TEMPLATE };
