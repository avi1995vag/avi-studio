const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../assets/apps/infographic-studio/photo-core.js');
const pixels=(w,h,color=[100,150,200,255])=>new Uint8ClampedArray(Array.from({length:w*h},()=>color).flat());
test('clipping masks leave photo pixels intact, retain soft alpha and can be released losslessly',()=>{
 const original=pixels(3,1),mask=new Uint8Array([0,128,255]),clipped=core.withMask(original,mask);
 assert.deepEqual([...clipped.filter((_,i)=>i%4===3)],[0,128,255]);assert.deepEqual([...original.filter((_,i)=>i%4===3)],[255,255,255]);
 const retouched=new Uint8ClampedArray(original);core.brush(retouched,3,1,{x:1,y:0},{x:1,y:0},{mode:'paint',radius:1,hardness:1,opacity:1,color:[30,60,90]});
 assert.deepEqual(core.withMask(retouched,null),retouched);assert.equal(core.withMask(retouched,mask)[4],30,'Photo edits remain separate from clip alpha');assert.throws(()=>core.withMask(original,new Uint8Array(1)),/dimensions/);
});
test('soft eraser changes alpha only inside the brush and restore brings original pixels back',()=>{
 const w=25,h=25,original=pixels(w,h),edited=new Uint8ClampedArray(original),point={x:12,y:12};
 core.brush(edited,w,h,point,point,{mode:'erase',radius:8,hardness:.5,opacity:1});assert.equal(edited[(12*w+12)*4+3],0);assert.ok(edited[(12*w+18)*4+3]>0);assert.ok(edited[(12*w+18)*4+3]<255);assert.equal(edited[3],255);
 core.brush(edited,w,h,point,point,{mode:'restore',radius:8,hardness:1,opacity:1},original);assert.deepEqual(edited,original);
});
test('clone uses the chosen offset and a frozen source; paint respects opacity and selection can subtract',()=>{
 const w=12,h=12,original=pixels(w,h);original.set([230,20,50,255],(2*w+2)*4);const edited=new Uint8ClampedArray(original),p={x:8,y:8};
 core.brush(edited,w,h,p,p,{mode:'clone',radius:1,hardness:1,opacity:1,offset:{x:-6,y:-6}},original);assert.deepEqual([...edited.slice((8*w+8)*4,(8*w+8)*4+4)],[230,20,50,255]);
 core.brush(edited,w,h,p,p,{mode:'paint',radius:1,hardness:1,opacity:.5,color:[0,100,200]});assert.equal(edited[(8*w+8)*4],115);
 const mask=new Uint8Array(w*h);core.brush(mask,w,h,p,p,{mode:'select',radius:3,hardness:1,opacity:1});assert.equal(mask[8*w+8],255);core.brush(mask,w,h,p,p,{mode:'deselect',radius:1,hardness:1,opacity:1});assert.equal(mask[8*w+8],0);assert.equal(mask[8*w+10],255);
});
test('content-aware repair replaces a selected object with actual source texture and preserves every unselected pixel',()=>{
 const width=64,height=48,data=pixels(width,height,[62,139,190,255]),mask=new Uint8Array(width*height);
 for(let y=18;y<30;y++)for(let x=26;x<38;x++){const i=y*width+x;data.set([240,20,30,255],i*4);mask[i]=255;}
 const progress=[],result=core.inpaint({data,mask,width,height},p=>progress.push(p.percent));
 for(let i=0;i<mask.length;i++)if(!mask[i])assert.deepEqual(result.slice(i*4,i*4+4),data.slice(i*4,i*4+4));
 assert.equal(result[(24*width+30)*4],62);assert.equal(result[(24*width+30)*4+2],190);assert.equal(progress.at(-1),100);
 assert.deepEqual(core.inpaint({data,mask,width,height}),result,'Repair is deterministic for the same photo and selection');
});
test('repair fails clearly for empty selections, oversized holes and absent visible source texture',()=>{
 const width=16,height=16,data=pixels(width,height),mask=new Uint8Array(width*height);
 assert.throws(()=>core.inpaint({data,mask,width,height}),/selection/);mask.fill(255);assert.throws(()=>core.inpaint({data,mask,width,height}),/smaller area/);
 mask.fill(0);mask[100]=255;assert.throws(()=>core.inpaint({data:pixels(width,height,[0,0,0,0]),mask,width,height}),/visible source texture/);
});
