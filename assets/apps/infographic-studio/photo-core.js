/* Local photo operations. No network, model downloads or provider keys. */
(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function withMask(data,mask){const output=new Uint8ClampedArray(data);if(mask){if(output.length!==mask.length*4)throw new Error('Clipping mask dimensions do not match the photo.');for(let i=0;i<mask.length;i++)output[i*4+3]*=mask[i]/255;}return output;}
  function over(data,i,r,g,b,alpha){
    const old=data[i+3]/255,next=alpha+old*(1-alpha);
    if(next){data[i]=(r*alpha+data[i]*old*(1-alpha))/next;data[i+1]=(g*alpha+data[i+1]*old*(1-alpha))/next;data[i+2]=(b*alpha+data[i+2]*old*(1-alpha))/next;}
    data[i+3]=next*255;
  }
  function brush(data,width,height,from,to,options,reference){
    const radius=Math.max(1,options.radius),hard=clamp(options.hardness??.8,0,1),opacity=clamp(options.opacity??1,0,1),mode=options.mode;
    const x0=Math.max(0,Math.floor(Math.min(from.x,to.x)-radius)),x1=Math.min(width-1,Math.ceil(Math.max(from.x,to.x)+radius));
    const y0=Math.max(0,Math.floor(Math.min(from.y,to.y)-radius)),y1=Math.min(height-1,Math.ceil(Math.max(from.y,to.y)+radius));
    const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const t=length?clamp(((x-from.x)*dx+(y-from.y)*dy)/length,0,1):0;
      const distance=Math.hypot(x-from.x-t*dx,y-from.y-t*dy);if(distance>radius)continue;
      const strength=opacity*(distance<=radius*hard?1:(radius-distance)/Math.max(.001,radius*(1-hard))),pixel=y*width+x,i=pixel*4;
      if(mode==='select'||mode==='deselect'){data[pixel]=mode==='select'?Math.max(data[pixel],Math.round(strength*255)):Math.round(data[pixel]*(1-strength));continue;}
      if(mode==='erase'){data[i+3]*=1-strength;continue;}
      if(mode==='restore'){if(reference)for(let k=0;k<4;k++)data[i+k]=reference[i+k]*strength+data[i+k]*(1-strength);continue;}
      if(mode==='clone'){
        const sx=Math.round(x+(options.offset?.x||0)),sy=Math.round(y+(options.offset?.y||0));
        if(!reference||sx<0||sy<0||sx>=width||sy>=height)continue;const j=(sy*width+sx)*4;
        over(data,i,reference[j],reference[j+1],reference[j+2],strength*reference[j+3]/255);continue;
      }
      const c=options.color||[6,71,255];over(data,i,c[0],c[1],c[2],strength);
    }
    return {x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
  }
  function sample(data,w,h,x,y,out,index){
    const xx=clamp(x,0,w-1),yy=clamp(y,0,h-1),a=Math.floor(xx),b=Math.floor(yy),fx=xx-a,fy=yy-b;
    const p=(b*w+a)*4,q=(b*w+Math.min(w-1,a+1))*4,r=(Math.min(h-1,b+1)*w+a)*4,s=(Math.min(h-1,b+1)*w+Math.min(w-1,a+1))*4;
    for(let k=0;k<4;k++)out[index+k]=(data[p+k]*(1-fx)+data[q+k]*fx)*(1-fy)+(data[r+k]*(1-fx)+data[s+k]*fx)*fy;
  }
  function resize(data,mask,w,h,nw,nh){
    const pixels=new Uint8ClampedArray(nw*nh*4),nextMask=new Uint8Array(nw*nh);
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
      const i=y*nw+x;sample(data,w,h,(x+.5)*w/nw-.5,(y+.5)*h/nh-.5,pixels,i*4);
      const xa=Math.floor(x*w/nw),xb=Math.min(w,Math.ceil((x+1)*w/nw)),ya=Math.floor(y*h/nh),yb=Math.min(h,Math.ceil((y+1)*h/nh));
      for(let sy=ya;sy<yb;sy++)for(let sx=xa;sx<xb;sx++)if(mask[sy*w+sx]>nextMask[i])nextMask[i]=mask[sy*w+sx];
    }
    return {data:pixels,mask:nextMask,width:nw,height:nh};
  }
  function inpaint({data,mask,width,height},progress=()=>{}){
    const total=width*height;if(data.length!==total*4||mask.length!==total)throw new Error('Photo and selection dimensions do not match.');
    let count=0;for(const v of mask)if(v>32)count++;
    if(!count)throw new Error('Paint or draw a selection over the object to remove first.');
    if(count/total>.4)throw new Error('Select a smaller area (under 40% of the photo). Local texture repair needs visible surrounding detail.');
    const original=new Uint8ClampedArray(data),levels=[];
    const cap=Math.min(1,960/Math.max(width,height)),maxW=Math.max(8,Math.round(width*cap)),maxH=Math.max(8,Math.round(height*cap));
    let factor=1;while(Math.max(maxW,maxH)/factor>160)factor*=2;
    for(;factor>=1;factor/=2)levels.push(resize(data,mask,width,height,Math.max(8,Math.round(maxW/factor)),Math.max(8,Math.round(maxH/factor))));
    let prior=null,seed=0x2f6e2b1;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
    for(let level=0;level<levels.length;level++){
      const current=levels[level],w=current.width,h=current.height,n=w*h,source=current.data,m=current.mask,work=new Uint8ClampedArray(source);
      let radius=2,valid=new Uint8Array(n),validCount=0;
      // Valid source patches contain no selected or transparent pixels.
      const integral=new Int32Array((w+1)*(h+1));
      for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x;row+=m[i]>32||source[i*4+3]<128?1:0;integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+row;}}
      for(;radius>=0;radius--){valid.fill(0);validCount=0;
        for(let y=radius;y<h-radius;y++)for(let x=radius;x<w-radius;x++){
          const a=x-radius,b=x+radius+1,c=y-radius,d=y+radius+1,sum=integral[d*(w+1)+b]-integral[c*(w+1)+b]-integral[d*(w+1)+a]+integral[c*(w+1)+a];
          if(!sum){valid[y*w+x]=1;validCount++;}
        }if(validCount)break;
      }
      if(!validCount)throw new Error('There is not enough visible source texture outside the selection.');
      const nearest=new Int32Array(n);nearest.fill(-1);const queue=new Int32Array(n);let tail=0;
      for(let i=0;i<n;i++)if(valid[i]){nearest[i]=i;queue[tail++]=i;}
      for(let head=0;head<tail;head++){
        const i=queue[head],x=i%w,y=(i/w)|0;
        for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&nearest[j]===-1){nearest[j]=nearest[i];queue[tail++]=j;}
      }
      const nx=new Int32Array(n),ny=new Int32Array(n),costs=new Float32Array(n),targets=[];
      for(let i=0;i<n;i++){
        nx[i]=nearest[i]%w;ny[i]=(nearest[i]/w)|0;
        if(m[i]<=32)continue;targets.push(i);const x=i%w,y=(i/w)|0;
        if(prior){
          const px=Math.min(prior.width-1,Math.floor(x*prior.width/w)),py=Math.min(prior.height-1,Math.floor(y*prior.height/h)),p=py*prior.width+px;
          const sx=clamp(Math.round(prior.nx[p]*w/prior.width),0,w-1),sy=clamp(Math.round(prior.ny[p]*h/prior.height),0,h-1);
          if(valid[sy*w+sx]){nx[i]=sx;ny[i]=sy;}
          sample(prior.data,prior.width,prior.height,(x+.5)*prior.width/w-.5,(y+.5)*prior.height/h-.5,work,i*4);
        }else for(let k=0;k<4;k++)work[i*4+k]=source[nearest[i]*4+k];
      }
      function cost(i,sx,sy,limit=Infinity){
        if(sx<radius||sy<radius||sx>=w-radius||sy>=h-radius||!valid[sy*w+sx])return Infinity;
        const x=i%w,y=(i/w)|0;let sum=0,weight=0;
        for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
          if(x+dx<0||y+dy<0||x+dx>=w||y+dy>=h)continue;const a=(y+dy)*w+x+dx,b=((sy+dy)*w+sx+dx)*4,wt=m[a]>32?1:5,j=a*4;
          sum+=wt*((work[j]-source[b])**2+(work[j+1]-source[b+1])**2+(work[j+2]-source[b+2])**2);weight+=wt;
        }
        return sum/Math.max(weight,1)+(Math.abs(sx-x)+Math.abs(sy-y))*.01;
      }
      for(const i of targets)costs[i]=cost(i,nx[i],ny[i]);
      const iterations=level===0?5:3;
      for(let iteration=0;iteration<iterations;iteration++){
        const forward=iteration%2===0;
        for(let t=forward?0:targets.length-1;forward?t<targets.length:t>=0;t+=forward?1:-1){
          const i=targets[t],x=i%w,y=(i/w)|0;let bx=nx[i],by=ny[i],best=cost(i,bx,by);
          const tryPatch=(sx,sy)=>{const next=cost(i,sx,sy,best);if(next<best){best=next;bx=sx;by=sy;}};
          if(forward){if(x)tryPatch(nx[i-1]+1,ny[i-1]);if(y)tryPatch(nx[i-w],ny[i-w]+1);}
          else{if(x<w-1)tryPatch(nx[i+1]-1,ny[i+1]);if(y<h-1)tryPatch(nx[i+w],ny[i+w]-1);}
          for(let search=Math.max(w,h);search>=1;search/=2)tryPatch(clamp(Math.round(bx+(random()*2-1)*search),0,w-1),clamp(Math.round(by+(random()*2-1)*search),0,h-1));
          nx[i]=bx;ny[i]=by;costs[i]=best;for(let k=0;k<4;k++)work[i*4+k]=source[(by*w+bx)*4+k];
        }
        progress({percent:Math.round((level+(iteration+1)/iterations)/levels.length*92),phase:'Matching nearby texture'});
      }
      // Overlapping patch votes reduce block boundaries without blurring known pixels.
      const voted=new Uint8ClampedArray(work);
      for(const i of targets){const x=i%w,y=(i/w)|0,sums=[0,0,0,0];let weights=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const j=yy*w+xx;if(m[j]<=32)continue;
          const sx=nx[j]-dx,sy=ny[j]-dy;if(sx<0||sy<0||sx>=w||sy>=h||m[sy*w+sx]>32)continue;const p=(sy*w+sx)*4,weight=1/(1+costs[j]/1000);weights+=weight;for(let k=0;k<4;k++)sums[k]+=source[p+k]*weight;
        }if(weights)for(let k=0;k<4;k++)voted[i*4+k]=sums[k]/weights;
      }
      prior={data:voted,width:w,height:h,nx,ny};
    }
    const output=new Uint8ClampedArray(original),pixel=new Float64Array(4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(!mask[i])continue;sample(prior.data,prior.width,prior.height,(x+.5)*prior.width/width-.5,(y+.5)*prior.height/height-.5,pixel,0);
      const a=mask[i]/255,oa=original[i*4+3]/255,ra=pixel[3]/255,outA=oa*(1-a)+ra*a;
      for(let k=0;k<3;k++)output[i*4+k]=outA?(original[i*4+k]*oa*(1-a)+pixel[k]*ra*a)/outA:0;output[i*4+3]=outA*255;
    }
    progress({percent:100,phase:'Ready'});return output;
  }
  const api={brush,inpaint,resize,withMask};if(typeof module==='object'&&module.exports)module.exports=api;else root.AviPhotoCore=api;
  // Register before the original infographic shortcuts, so photo edits never delete layout elements.
  if(typeof window==='object')window.addEventListener('keydown',event=>{const editor=window.AviPhotoEditor;if(editor?.isOpen()){event.stopImmediatePropagation();editor.handleKey(event);}},true);
})(typeof self==='object'?self:globalThis);
