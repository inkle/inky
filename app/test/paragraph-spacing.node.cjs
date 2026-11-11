"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { MARKER, annotate } = require("../renderer/paragraphSpacing.js");
const TagFormat = require("../renderer/tagFormat.js").TagFormat;
const compiler = path.resolve(__dirname, "../main-process/ink/inklecate_linux");
const cases = [
  "-> start\n=== start ===\nFirst.\nSecond.\n\nThird.\n-> DONE\n",
  "-> start\n=== start ===\n#screen\n#title: Arrival\nFirst.\n\nSecond.\n+ [Go] -> next\n=== next ===\nThird.\n-> DONE\n",
  "VAR active = true\n-> start\n=== start ===\n{ active:\n    First.\n\n    Second.\n- else:\n    Third.\n}\n-> DONE\n",
  "-> start\n=== start ===\n* [Open]\n    First.\n\n    Second.\n    -> DONE\n* [Close]\n    Third.\n    -> DONE\n",
  "-> start\n=== start ===\nGlue <>\n\nand text.\n-> DONE\n"
];
function compile(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"inky-paragraph-"));
  try {
    const file=path.join(dir,"source.ink"),out=path.join(dir,"out.json");
    fs.writeFileSync(file,source);
    execFileSync(compiler,["-kj","-o",out,file],{encoding:"utf8",timeout:12000});
    return JSON.parse(fs.readFileSync(out,"utf8"));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
function strip(value) {
  if(Array.isArray(value)) {
    const out=[];
    for(let i=0;i<value.length;i++) {
      if(value[i]==="#" && value[i+1]==="^"+MARKER && value[i+2]==="/#") { i+=2; continue; }
      out.push(strip(value[i]));
    }
    return out;
  }
  if(value && typeof value==="object")
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,strip(v)]));
  return value;
}
test("blank line marks only the next paragraph and keeps original line numbers",()=>{
  const source="A\nB\n\nC\n\n\nD\n";
  const result=annotate(source);
  assert.equal(result,"A\nB\n# "+MARKER+"\nC\n\n# "+MARKER+"\nD\n");
  assert.equal(source.split("\n").length,result.split("\n").length);
  assert.equal(annotate("A\nB\n"),"A\nB\n");
  assert.equal(annotate("A <>\n\nB"),"A <>\n\nB");
  assert.equal(annotate("A\n\n-> DONE"),"A\n\n-> DONE");
  assert.equal(annotate("/*\nA\n\nB\n*/"),"/*\nA\n\nB\n*/");
  const crlf="A\r\n\r\nB\r\n";
  assert.equal(annotate(crlf),"A\r\n# "+MARKER+"\r\nB\r\n");
});
test("Ink compilation preserves story data and choices after removing private tags",()=>{
  if(process.platform!=="linux" || !fs.existsSync(compiler)) return;
  for(const source of cases){
    const before=compile(TagFormat.normalizeText(source));
    const after=compile(annotate(TagFormat.normalizeText(source)));
    assert.deepEqual(strip(after),before);
  }
});
test("Ink runtime attaches marker to the intended output line",()=>{
  if(process.platform!=="linux" || !fs.existsSync(compiler)) return;
  let ink; try{ink=require("inkjs");}catch{return;}
  const story=new ink.Story(compile(annotate(cases[0])));
  const seen=[];
  while(story.canContinue)seen.push({text:story.Continue().trim(),tags:story.currentTags});
  assert.deepEqual(seen.map(x=>x.text),["First.","Second.","Third."]);
  assert.deepEqual(seen.map(x=>x.tags.includes(MARKER)),[false,false,true]);
});
test("Preview and browser rendering hide the tag and give identical spacing",()=>{
  const read=p=>fs.readFileSync(path.resolve(__dirname,p),"utf8");
  assert.match(read("../renderer/playerView.js"),/addClass\("inky-paragraph-gap"\)/);
  assert.match(read("../renderer/playerView.js"),/String\(tag\)\.trim\(\) !== ParagraphSpacing\.MARKER/);
  assert.match(read("../export-for-web-template/main.js"),/classList\.add\('inky-paragraph-gap'\)/);
  assert.match(read("../export-for-web-template/main.js"),/normalized !== "__inky_paragraph_gap__"/);
  assert.match(read("../renderer/main.css"),/p\.storyText\.inky-paragraph-gap\s*\{\s*margin-top:\s*0\.9em/);
  assert.match(read("../export-for-web-template/style.css"),/p\.inky-paragraph-gap\s*\{\s*margin-top:\s*0\.9em/);
});
