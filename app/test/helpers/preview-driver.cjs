// Real Linux/X11 renderer driver. Imported only by the opt-in graphical test suite.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {launch, sleep} = require('./preview-session.cjs');
const pixels = require('./preview-pixels.cjs');

function snapshot() {
    const player = document.querySelector('#player');
    const frame = player.querySelector('.innerText.active');
    const passage = frame.querySelector('.story-passage');
    const rect = r => ({x:r.x, y:r.y, width:r.width, height:r.height});
    const paragraphs = [...passage.querySelectorAll('p.storyText')].map(p => {
        const range = document.createRange(), characters = [];
        const walker = document.createTreeWalker(p,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
            const node = walker.currentNode;
            for(let i=0;i<node.length;i++) {
                if(node.data[i] !== 'A') continue;
                range.setStart(node,i); range.setEnd(node,i+1);
                characters.push(rect(range.getBoundingClientRect()));
            }
        }
        const style = getComputedStyle(p);
        return {text:p.textContent,rect:rect(p.getBoundingClientRect()),characters,
            font:style.font,lineHeight:style.lineHeight,marginTop:style.marginTop};
    });
    return {viewport:{width:innerWidth,height:innerHeight},paragraphs,
        source:ace.edit('editor').getValue(),sessionId:require('./jquery-2.2.3.min.js')(frame).data('sessionId'),
        passage:rect(passage.getBoundingClientRect()),title:passage.querySelector('h2')?rect(passage.querySelector('h2').getBoundingClientRect()):null,
        nodeCount:player.querySelectorAll('*').length,
        sameNodes:!window.__legendaryNodes||[...player.querySelectorAll('*')].every((e,i)=>e===window.__legendaryNodes[i])};
}

class PreviewDriver {
    static async open(output, source) {
        fs.mkdirSync(path.join(output,'project'),{recursive:true});
        const fixture = path.join(output,'project','legendary.ink');
        fs.writeFileSync(fixture,source);
        const appRoot = path.resolve(__dirname,'../..');
        const binary = process.env.INKY_TEST_APP || path.resolve(appRoot,'../Inky-linux-x64/Inky');
        const app = await launch({binary, appPath:process.env.INKY_TEST_MAIN, fixture, output,
            viewSettings:{theme:'light',zoom:'125',animationEnabled:true}});
        const driver = new PreviewDriver(app,output);
        try {
            await app.until(`!!document.querySelector('#title-screen .choice-button')`);
            // Startup can briefly show the starter story before the command-line
            // fixture finishes loading. Both have three paragraphs. Observe the
            // requested source and its actual completed Preview, not that count.
            await app.until(`ace.edit('editor').getValue()===${JSON.stringify(source)} &&
                document.querySelectorAll('.innerText.active p.storyText').length===3 &&
                [...document.querySelectorAll('.innerText.active p.storyText')].every(p=>p.textContent.trim()==='A'.repeat(25))`);
            const title = 'Inky graphical regression '+app.child.pid;
            await app.evaluate(`document.title=${JSON.stringify(title)}`);
            await sleep(80);
            driver.windowId = execFileSync('xwininfo',['-name',title],{encoding:'utf8'}).match(/Window id: (0x[\da-f]+)/i)[1];
            await driver.resize();
            await app.renderer.send('Page.bringToFront');
            await app.evaluate(`(()=>{window.__legendaryInput=false;document.addEventListener('keydown',e=>{if(!window.__legendaryInput){e.preventDefault();e.stopImmediatePropagation()}},true)})()`);
            await app.evaluate(`document.querySelector('#title-screen .choice-button').click()`);
            await app.until(`document.querySelectorAll('.innerText.active p.storyText').length===3`);
            await sleep(800);
            const info = await app.browser.send('SystemInfo.getInfo');
            fs.writeFileSync(path.join(output,'gpu.json'),JSON.stringify(info,null,2));
            assert.equal(info.gpu.featureStatus.gpu_compositing,'enabled','The release regression requires GPU composition');
            assert.equal(info.gpu.featureStatus.rasterization,'enabled','The release regression requires GPU rasterization');
            return driver;
        } catch(error) { await driver.close(); throw error; }
    }
    constructor(app, output) { this.app=app; this.output=output; this.index=0; }
    evaluate(expression) { return this.app.evaluate(expression); }
    async resize(width, height) {
        const parameters = [path.join(__dirname,'preview-x11-window.py'),this.windowId];
        if(width) parameters.push(String(width),String(height));
        execFileSync('python3',parameters); await sleep(250);
    }
    capture(name) {
        const file = path.join(this.output,name+'.xwd');
        execFileSync('python3',[path.join(__dirname,'preview-x11-capture.py'),this.windowId,file]);
        return file;
    }
    async check(source, name='render') {
        const active = execFileSync('xprop',['-root','_NET_ACTIVE_WINDOW'],{encoding:'utf8'});
        if(!active.includes(this.windowId)) return {invalid:'Diagnostic window was covered'};
        const prefix = String(++this.index).padStart(3,'0')+'-'+name;
        // Capture the actual displayed pixels before layout reads or screenshot APIs.
        const beforeFile = this.capture(prefix+'-before');
        await this.evaluate(`window.__legendaryNodes=[...document.querySelectorAll('#player *')]`);
        const before = await this.evaluate(`(${snapshot})()`);
        fs.writeFileSync(path.join(this.output,prefix+'-before.json'),JSON.stringify(before,null,2));
        assert.equal(before.source,source,'The exact story must survive the experiment');
        assert.deepEqual(before.paragraphs.map(p=>p.text.trim()),Array(3).fill('A'.repeat(25)));
        assert.equal(before.paragraphs.flatMap(p=>p.characters).length,75);
        for(let i=0;i<3;i++) {
            const p=before.paragraphs[i];
            assert(p.rect.height>0);
            if(i) assert(p.rect.y>=before.paragraphs[i-1].rect.y+before.paragraphs[i-1].rect.height-0.5,'Paragraphs must not overlap');
            for(const c of p.characters) assert(c.width>0&&c.y>=p.rect.y-1&&c.y+c.height<=p.rect.y+p.rect.height+1);
        }
        if(before.title) assert(before.title.y+before.title.height<=before.paragraphs[0].rect.y+1,'Scene title must not overlap narrative');
        // Independent raster reference, only in the test. Never call an application repaint API.
        await this.evaluate(`(()=>{const p=document.querySelector('#player');window.__legendaryTransform=[p.style.getPropertyValue('transform'),p.style.getPropertyPriority('transform')];p.style.setProperty('transform','translateZ(0)','important')})()`);
        await this.evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
        await sleep(100);
        const referenceFile = this.capture(prefix+'-reference');
        await this.evaluate(`(()=>{const p=document.querySelector('#player'),v=window.__legendaryTransform;if(v[0])p.style.setProperty('transform',v[0],v[1]);else p.style.removeProperty('transform')})()`);
        await sleep(100);
        const after = await this.evaluate(`(${snapshot})()`);
        assert.equal(after.sessionId,before.sessionId,'A recompilation raced with observation');
        assert.equal(after.nodeCount,before.nodeCount); assert(after.sameNodes);
        assert.deepEqual(after.paragraphs,before.paragraphs,'Reference rendering must preserve geometry and text');
        const diff = pixels.compare(beforeFile,referenceFile,before);
        fs.writeFileSync(path.join(this.output,prefix+'-comparison.json'),JSON.stringify(diff,null,2));
        assert.equal(diff.deltaOver16,0,'Displayed glyphs differ from the independently rasterized reference: '+JSON.stringify(diff));
        return {valid:true,before,diff};
    }
    async input(method, parameters) {
        await this.evaluate(`window.__legendaryInput=true`);
        try { return await this.app.renderer.send(method,parameters); }
        finally { await this.evaluate(`window.__legendaryInput=false`); }
    }
    async waitForNewSession(old) {
        await this.app.until(`require('./jquery-2.2.3.min.js')('.innerText.active').data('sessionId')!==${JSON.stringify(old)}`);
        await sleep(500);
    }
    async replace(source) {
        await this.app.renderer.send('Page.bringToFront');
        const old=await this.evaluate(`require('./jquery-2.2.3.min.js')('.innerText.active').data('sessionId')`);
        await this.evaluate(`(()=>{const e=ace.edit('editor');e.focus();e.selectAll()})()`);
        await this.input('Input.insertText',{text:source}); await this.waitForNewSession(old);
    }
    async key(row,column,key) {
        await this.app.renderer.send('Page.bringToFront');
        const old=await this.evaluate(`require('./jquery-2.2.3.min.js')('.innerText.active').data('sessionId')`);
        await this.evaluate(`(()=>{const e=ace.edit('editor');e.focus();e.selection.moveCursorTo(${row},${column});e.selection.clearSelection()})()`);
        const code=key==='Enter'?13:8;
        await this.input('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code,...(key==='Enter'?{text:'\r'}:{})});
        await this.input('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});
        await this.waitForNewSession(old);
    }
    async close() { await this.app.close(); }
}
module.exports={PreviewDriver,snapshot};
