const fs = require('node:fs');
function read(filename) {
    const data = fs.existsSync(filename)?fs.readFileSync(filename):require('node:zlib').gunzipSync(fs.readFileSync(filename+'.gz'));
    const fields = Array.from({length:25},(_,i)=>data.readUInt32BE(i*4));
    const [header,version,format,depth,width,height,offset,order,unit,bitorder,pad,bits,stride,visual,red,green,blue,rgb,entries,colors]=fields;
    if(version!==7 || format!==2 || bits!==32 || order!==0 || offset!==0 || red!==0xff0000 || green!==0xff00 || blue!==0xff) throw Error('Unsupported XWD encoding: '+JSON.stringify(fields));
    return {data,start:header+colors*12,width,height,stride};
}
function compare(beforeFile, afterFile, snapshot) {
    const a=read(beforeFile),b=read(afterFile);
    if(a.width!==b.width || a.height!==b.height) return {invalid:'window dimensions changed'};
    const scale=a.width/snapshot.viewport.width;
    const offsetY=a.height-snapshot.viewport.height*scale;
    let changed=0,over16=0,maxDelta=0,bbox=null;
    const first=snapshot.paragraphs[0].rect,last=snapshot.paragraphs.at(-1).rect;
    const region={x0:Math.floor(first.x*scale)-4,x1:Math.ceil((first.x+first.width)*scale)+4,
        y0:Math.floor(first.y*scale+offsetY)-5,y1:Math.ceil((last.y+last.height)*scale+offsetY)+5};
    for(let y=Math.max(0,region.y0);y<Math.min(a.height,region.y1);y++) {
        for(let x=Math.max(0,region.x0);x<Math.min(a.width,region.x1);x++) {
            const pa=a.start+y*a.stride+x*4,pb=b.start+y*b.stride+x*4;
            const delta=Math.max(Math.abs(a.data[pa]-b.data[pb]),Math.abs(a.data[pa+1]-b.data[pb+1]),Math.abs(a.data[pa+2]-b.data[pb+2]));
            if(!delta)continue;
            changed++;if(delta>16)over16++;maxDelta=Math.max(maxDelta,delta);
            bbox=bbox?[Math.min(bbox[0],x),Math.min(bbox[1],y),Math.max(bbox[2],x+1),Math.max(bbox[3],y+1)]:[x,y,x+1,y+1];
        }
    }
    return {changedPixels:changed,deltaOver16:over16,maxChannelDelta:maxDelta,bbox,region,scale,offsetY};
}
module.exports={read,compare};
