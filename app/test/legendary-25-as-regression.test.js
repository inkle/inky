// The Legendary 25 A's
//
// These innocent letters once defeated
// the Inky Extended Live Preview.
//
// The K's joined the rebellion later.
//
// DO NOT DELETE THIS REGRESSION TEST.
// We have suffered enough.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {PreviewDriver}=require('./helpers/preview-driver.cjs');
const title=fs.readFileSync(path.join(__dirname,'fixtures/legendary-25-as.ink'),'utf8');
const leading=fs.readFileSync(path.join(__dirname,'fixtures/legendary-25-as-leading-blank.ink'),'utf8');
const plain=leading.replace('=== start ===\n\n','=== start ===\n');
const enabled=process.env.INKY_RUN_VISUAL_TESTS==='1';
if(process.env.INKY_VISUAL_REQUIRED==='1') assert(enabled&&process.platform==='linux'&&process.env.DISPLAY,'An X11/GPU session is required for the release regression');

describe('The Legendary 25 A\'s — immutable fixtures',function(){
    it('preserves the exact title story and the leading-blank control',function(){
        assert.equal(title,'-> start\n=== start ===\n#title: KKKKKKKKKK\n'+'A'.repeat(25)+'\n\n'+'A'.repeat(25)+'\n\n'+'A'.repeat(25)+'\n\n-> DONE\n');
        assert.equal(leading,'-> start\n=== start ===\n\n'+'A'.repeat(25)+'\n\n'+'A'.repeat(25)+'\n\n\n'+'A'.repeat(25)+'\n\n-> DONE\n');
    });
});

(enabled?describe:describe.skip)('The Legendary 25 A\'s — real Linux GPU rendering',function(){
    this.timeout(300000);
    const output=process.env.INKY_VISUAL_ARTIFACTS||fs.mkdtempSync(path.join(os.tmpdir(),'inky-legendary-'));
    let sequence=0;
    const open=source=>PreviewDriver.open(path.join(output,String(++sequence).padStart(3,'0')),source);
    async function starts(source,count){
        let valid=0;
        for(let attempt=0;attempt<count+10&&valid<count;attempt++){
            const driver=await open(source);
            try {if((await driver.check(source,'cold-start')).valid)valid++;}
            finally {await driver.close();}
        }
        assert.equal(valid,count,'Covered windows do not count as successful visual observations');
    }
    it('renders the title fixture on 20 GPU-enabled cold starts without glyph fragments',async function(){await starts(title,20);});
    it('loads the leading-blank variant directly with the GPU enabled',async function(){await starts(leading,5);});
    it('inserts and removes the blank after the knot using real Enter and Backspace',async function(){
        const driver=await open(plain);
        try {
            for(let i=0;i<10;i++){
                await driver.key(1,13,'Enter');assert((await driver.check(leading,'enter-'+i)).valid);
                await driver.key(2,0,'Backspace');assert((await driver.check(plain,'backspace-'+i)).valid);
            }
        }finally{await driver.close();}
    });
    it('recompiles titles and blank lines correctly at different actual window sizes',async function(){
        const driver=await open(title);
        try {
            const widths=[];
            for(const size of [[1100,800],[1451,900],null]){
                await driver.resize(...(size||[]));
                widths.push(await driver.evaluate('innerWidth'));
                await driver.replace(leading);assert((await driver.check(leading,'resized-leading')).valid);
                await driver.replace(title);assert((await driver.check(title,'resized-title')).valid);
            }
            assert(new Set(widths).size>=2,'The window-size experiment must resize the real window');
        }finally{await driver.close();}
    });
    it('keeps reading text visible and clips scrolled history above the passage',async function(){
        const driver=await open(title);
        try {
            const scrollStory=title.replace('\n\n'+ 'A'.repeat(25)+'\n\n', '\n'.repeat(28)+'A'.repeat(25)+'\n\n');
            await driver.replace(scrollStory);
            await driver.evaluate(`require('./playerView.js').PlayerView.contentReady()`);
            const before=await driver.evaluate(`(()=>{const p=document.querySelector('.innerText.active .story-passage'),s=getComputedStyle(p),r=p.getBoundingClientRect(),title=p.querySelector('h2').getBoundingClientRect();return{height:p.clientHeight,scroll:p.scrollHeight,cover:parseFloat(s.getPropertyValue('--story-top-cover'))||0,top:r.top,titleTop:title.top,firstParagraphTop:p.querySelector('p.storyText').getBoundingClientRect().top}})()`);
            assert(before.scroll>before.height,'This case must exercise actual scrolling');
            assert(before.titleTop>=before.top+before.cover-1,'The current title must be readable');
            assert(before.cover>0,'The test must exercise the hard top cover');
            await driver.evaluate(`document.querySelector('.innerText.active .story-passage').scrollTop=${before.firstParagraphTop-before.top-before.cover/3}`);
            await new Promise(r=>setTimeout(r,200));
            const after=await driver.evaluate(`(()=>{const p=document.querySelector('.innerText.active .story-passage'),r=p.getBoundingClientRect(),s=getComputedStyle(p);return{scrollTop:p.scrollTop,top:r.top,left:r.left,width:r.width,cover:parseFloat(s.getPropertyValue('--story-top-cover'))||0}})()`);
            assert(after.scrollTop>0);
            // The screenshot must contain no text in the hard-covered top band.
            const image=require('./helpers/preview-pixels.cjs').read(driver.capture('scrolled-top-clip'));
            const viewport=await driver.evaluate('({width:innerWidth,height:innerHeight})');
            const scale=image.width/viewport.width,offset=image.height-viewport.height*scale;
            const top=Math.ceil(after.top*scale+offset)+2,bottom=Math.floor((after.top+after.cover)*scale+offset)-1;
            let ink=0;
            const left=Math.ceil((after.left+30)*scale),right=Math.floor((after.left+after.width-90)*scale);
            assert(right>left&&bottom>top,'The pixel check must cover a nonempty reading margin');
            for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
                const at=image.start+y*image.stride+x*4;if(Math.min(image.data[at],image.data[at+1],image.data[at+2])<180)ink++;
            }
            assert.equal(ink,0,'Scrolled glyphs must not leak through the covered reading margin');
        }finally{await driver.close();}
    });
});
