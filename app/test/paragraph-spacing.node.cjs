"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { MARKER, gapCount, annotate } = require("../renderer/paragraphSpacing.js");
const TagFormat = require("../renderer/tagFormat.js").TagFormat;
const compiler = path.resolve(__dirname, "../main-process/ink/inklecate_linux");
const cases = [
  "-> start\n=== start ===\nFirst.\nSecond.\n\nThird.\n-> DONE\n",
  "-> start\n=== start ===\nFirst.\nSecond.\n\n\n\nThird.\n-> DONE\n",
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
      if(value[i]==="#" && String(value[i+1]).startsWith("^") && gapCount(String(value[i+1]).slice(1)) && value[i+2]==="/#") { i+=2; continue; }
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
  assert.equal(result,"A\nB\n# "+MARKER+": 1\nC\n# "+MARKER+": 2\n\nD\n");
  assert.equal(source.split("\n").length,result.split("\n").length);
  assert.equal(annotate("A\nB\n"),"A\nB\n");
  assert.equal(annotate("A <>\n\nB"),"A <>\n\nB");
  assert.equal(annotate("A\n\n-> DONE"),"A\n\n-> DONE");
  assert.equal(annotate("/*\nA\n\nB\n*/"),"/*\nA\n\nB\n*/");
  const crlf="A\r\n\r\nB\r\n";
  assert.equal(annotate(crlf),"A\r\n# "+MARKER+": 1\r\nB\r\n");
  assert.equal(gapCount(MARKER),1);
  assert.equal(gapCount(MARKER+": 3"),3);
  assert.equal(gapCount(MARKER+": 20"),20);
  assert.equal(gapCount(MARKER+": invalid"),0);
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
  assert.deepEqual(seen.map(x=>x.tags.some(tag=>gapCount(tag)===1)),[false,false,true]);
  const multi=new ink.Story(compile(annotate(cases[1])));
  const seenMulti=[];
  while(multi.canContinue)seenMulti.push({text:multi.Continue().trim(),tags:multi.currentTags});
  assert.deepEqual(seenMulti.map(x=>x.tags.map(gapCount).find(Boolean)||0),[0,0,3]);
});
test("Preview and browser rendering hide the tag and give identical spacing",()=>{
  const read=p=>fs.readFileSync(path.resolve(__dirname,p),"utf8");
  assert.match(read("../renderer/playerView.js"),/addClass\("inky-paragraph-gap"\)/);
  assert.match(read("../renderer/playerView.js"),/ParagraphSpacing\.gapCount\(tag\)/);
  assert.match(read("../export-for-web-template/main.js"),/classList\.add\('inky-paragraph-gap'\)/);
  assert.match(read("../export-for-web-template/main.js"),/paragraphGapCount\(normalized\) === 0/);
  assert.match(read("../renderer/main.css"),/p\.storyText\.inky-paragraph-gap\s*\{\s*margin-top:\s*var\(--inky-paragraph-gap, 1lh\)/);
  // gameChrome.css loads after main.css, so its margin reset must explicitly
  // keep the higher-specificity blank-line gap intact.
  const chrome = read("../renderer/gameChrome.css");
  assert.match(chrome, /#main #player \.story-passage p\.storyText\.inky-paragraph-gap\s*\{\s*margin-top:\s*0\.9em/);
  assert.ok(chrome.indexOf("p.storyText.inky-paragraph-gap") > chrome.indexOf(".story-passage p.storyText {"), "gap override must follow the baseline margin reset");
  assert.match(read("../renderer/playerView.js"),/blankLines \+ "lh"/);
  assert.match(read("../export-for-web-template/main.js"),/blankLines \+ 'lh'/);
  assert.match(read("../renderer/gameChrome.css"),/flex-shrink:\s*0/);
  assert.match(read("../renderer/gameChrome.css"),/p\.storyText\.inky-paragraph-gap\s*\{\s*margin-top:\s*var\(--inky-paragraph-gap, 1lh\)/);
  assert.match(read("../export-for-web-template/style.css"),/p\.inky-paragraph-gap\s*\{\s*margin-top:\s*var\(--inky-paragraph-gap, 1lh\)/);
});
