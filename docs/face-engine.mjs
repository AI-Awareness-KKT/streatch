export const W=960,H=540;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function faceInfo(points){
  if(!points?.length)return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  return {points,left,right,top,bottom,width:right-left,height:bottom-top};
}
export function fitVideo(width,height){
  const scale=Math.min(W/width,H/height),w=width*scale,h=height*scale;
  return {x:(W-w)/2,y:(H-h)/2,width:w,height:h};
}
export function headFrame(face,reach=1.15,horizontalShift=.1){
  if(!face)return null;
  const top=face.points.length>=468?face.points[10]:{x:(face.left+face.right)/2,y:face.top};
  const chin=face.points.length>=468?face.points[152]:{x:(face.left+face.right)/2,y:face.bottom};
  const length=Math.max(20,distance(top,chin)),uy={x:(chin.x-top.x)/length,y:(chin.y-top.y)/length},ux={x:uy.y,y:-uy.x};
  const width=face.points.length>=468?distance(face.points[234],face.points[454]):face.width;
  const origin={x:(top.x+chin.x)/2,y:(top.y+chin.y)/2};
  const shift=length*(.04-.4*reach)/2;
  const center={x:origin.x+uy.x*shift+width*horizontalShift,y:origin.y+uy.y*shift};
  return {origin,center,ux,uy,width:Math.max(30,width),height:length,rx:Math.max(20,width*.65*Math.pow(reach,.65)),ry:length*(1+.4*reach+.04)/2};
}
export function headCoordinates(point,frame){
  const dx=point.x-frame.origin.x,dy=point.y-frame.origin.y;
  return {u:(dx*frame.ux.x+dy*frame.ux.y)/frame.width,v:(dx*frame.uy.x+dy*frame.uy.y)/frame.height};
}
export function headPoint(uv,frame){
  return {x:frame.origin.x+frame.ux.x*uv.u*frame.width+frame.uy.x*uv.v*frame.height,y:frame.origin.y+frame.ux.y*uv.u*frame.width+frame.uy.y*uv.v*frame.height};
}
export function insideHead(point,frame){
  const dx=point.x-frame.center.x,dy=point.y-frame.center.y;
  return ((dx*frame.ux.x+dy*frame.ux.y)/frame.rx)**2+((dx*frame.uy.x+dy*frame.uy.y)/frame.ry)**2<=1.06;
}
export function nearestFeature(point,face){
  if(!face)return null;
  const margin=face.width*.15;
  if(point.x<face.left-margin||point.x>face.right+margin||point.y<face.top-margin||point.y>face.bottom+margin)return null;
  let best=-1,d=Infinity;
  face.points.forEach((p,i)=>{const value=distance(p,point);if(value<d){d=value;best=i;}});
  return d<Math.max(40,face.width*.28)?best:null;
}
export class FacePinchState{
  constructor(){this.reset();}
  reset(){this.slots=new Map();this.latches=new Map();this.sequence=0;this.rejected=false;}
  get heldCount(){return [...this.slots.values()].filter(slot=>slot.mode==='held').length;}
  undoLast(){
    const entry=[...this.slots.entries()].reverse().find(([,slot])=>slot.mode==='held');
    if(!entry)return false;
    this.slots.delete(entry[0]);return true;
  }
  begin(id,point,face,settings={}){
    const fullHead=settings.scope==='head',frame=fullHead?headFrame(face,settings.headReach,settings.headShift):null;
    const index=fullHead?null:nearestFeature(point,face);
    if(fullHead?(!frame||!insideHead(point,frame)):index===null){this.rejected=true;return false;}
    this.rejected=false;
    const headUV=fullHead?headCoordinates(point,frame):null;
    this.slots.set(id,{id,index,headUV,tool:settings.tool||'stretch',scope:settings.scope||'face',anchor:fullHead?{...point}:{...face.points[index]},origin:{...point},delta:{x:0,y:0},mode:'active'});
    return true;
  }
  move(id,point,face){
    const slot=this.slots.get(id);
    if(slot?.mode!=='active')return;
    let dx=point.x-slot.origin.x,dy=point.y-slot.origin.y;
    const length=Math.hypot(dx,dy),limit=Math.max(90,(face?.width||250)*.95);
    if(length>limit){dx*=limit/length;dy*=limit/length;}
    slot.delta={x:dx,y:dy};
  }
  release(id,hold,settings){
    const slot=this.slots.get(id);
    if(slot?.mode!=='active')return;
    if(hold){
      this.slots.delete(id);
      if(Math.hypot(slot.delta.x,slot.delta.y)<1)return;
      const savedId=`held-${++this.sequence}`;
      this.slots.set(savedId,{...slot,id:savedId,mode:'held',settings:settings?{...settings}:undefined});
    }else slot.mode='spring';
  }
  updateHands(hands,face,now,hold,settings){
    const visible=new Set();
    for(const hand of hands){
      visible.add(hand.id);
      const p=hand.points;
      const midpoint={x:(p[4].x+p[8].x)/2,y:(p[4].y+p[8].y)/2};
      const ratio=distance(p[4],p[8])/Math.max(25,distance(p[5],p[17]));
      const previous=this.latches.get(hand.id);
      const closed=previous?.closed?ratio<.68:ratio<.40;
      if(closed&&!previous?.closed)this.begin(hand.id,midpoint,face,settings);
      if(closed)this.move(hand.id,midpoint,face);
      else this.release(hand.id,hold,settings);
      this.latches.set(hand.id,{closed,seen:now,midpoint});
    }
    for(const [id,latch]of this.latches){
      if(!visible.has(id)&&now-latch.seen>180){this.release(id,hold,settings);this.latches.delete(id);}
    }
  }
  tick(face,dt,hold){
    for(const [id,slot]of this.slots){
      if(face&&slot.headUV)slot.anchor=headPoint(slot.headUV,headFrame(face));
      else if(face?.points[slot.index])slot.anchor={...face.points[slot.index]};
      if(slot.mode==='held'&&!hold)slot.mode='spring';
      if(slot.mode==='spring'){
        const decay=Math.exp(-12*Math.min(dt,.1));slot.delta.x*=decay;slot.delta.y*=decay;
        if(Math.hypot(slot.delta.x,slot.delta.y)<.5)this.slots.delete(id);
      }
    }
  }
  warps(face,strength=1,area=.4){
    return [...this.slots.values()].filter(slot=>face||slot.mode!=='held').map(slot=>{
      const power=slot.settings?.strength??strength,brush=slot.settings?.area??area;
      const radius=Math.max(40,Math.min(slot.scope==='head'?480:190,(face?.width||260)*brush));
      const length=Math.hypot(slot.delta.x,slot.delta.y),unit=face?.width||260;
      const amount=slot.tool==='inflate'?Math.min(1.5,length/unit*3*power):slot.tool==='shrink'?-Math.min(.7,length/unit*2*power):slot.tool==='twist'?Math.max(-2.8,Math.min(2.8,slot.delta.x/unit*4*power)):0;
      return {anchor:slot.anchor,delta:{x:slot.delta.x*power,y:slot.delta.y*power},kind:slot.tool,amount,radius,mode:slot.mode,id:slot.id};
    });
  }
}
// Brushes map displayed pixels back to their source, with a soft boundary.
export function prepareBrushes(warps,scale=1){
  return warps.filter(w=>Math.hypot(w.delta.x,w.delta.y)>.3||Math.abs(w.amount||0)>.001).map(w=>{
    const kind=w.kind||'stretch',dx=w.delta.x*scale,dy=w.delta.y*scale;
    const r=(w.radius+(kind==='stretch'?Math.hypot(w.delta.x,w.delta.y)*.55:0))*scale;
    return {kind,dx,dy,amount:w.amount||0,tx:(w.anchor.x+(kind==='stretch'?w.delta.x:0))*scale,ty:(w.anchor.y+(kind==='stretch'?w.delta.y:0))*scale,r,r2:r*r};
  });
}
function brushOffset(x,y,b){
  const ox=x-b.tx,oy=y-b.ty,d2=(ox*ox+oy*oy)/b.r2;
  if(d2>=1)return null;
  const weight=(1-d2)**3;
  if(b.kind==='stretch')return {x:-b.dx*weight,y:-b.dy*weight};
  if(b.kind==='twist'){
    const angle=-b.amount*weight,c=Math.cos(angle),s=Math.sin(angle);
    return {x:ox*c-oy*s-ox,y:ox*s+oy*c-oy};
  }
  const factor=1/(1+b.amount*weight);
  return {x:ox*(factor-1),y:oy*(factor-1)};
}
export function samplePosition(x,y,warps,scale=1){
  let sx=x,sy=y;
  for(const brush of prepareBrushes(warps,scale)){
    const offset=brushOffset(x,y,brush);if(offset){sx+=offset.x;sy+=offset.y;}
  }
  return {x:sx,y:sy};
}
export function warpPixels(input,output,width,height,warps,scale){
  output.set(input);
  const brushes=prepareBrushes(warps,scale);
  if(!brushes.length)return;
  const x0=Math.max(0,Math.floor(Math.min(...brushes.map(b=>b.tx-b.r))));
  const y0=Math.max(0,Math.floor(Math.min(...brushes.map(b=>b.ty-b.r))));
  const x1=Math.min(width-1,Math.ceil(Math.max(...brushes.map(b=>b.tx+b.r))));
  const y1=Math.min(height-1,Math.ceil(Math.max(...brushes.map(b=>b.ty+b.r))));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    let sx=x,sy=y,changed=false;
    for(const b of brushes){
      const ox=x-b.tx,oy=y-b.ty,d2=(ox*ox+oy*oy)/b.r2;
      if(d2>=1)continue;
      changed=true;const weight=(1-d2)**3;
      if(b.kind==='stretch'){sx-=b.dx*weight;sy-=b.dy*weight;}
      else if(b.kind==='twist'){const a=-b.amount*weight,c=Math.cos(a),s=Math.sin(a);sx+=ox*c-oy*s-ox;sy+=ox*s+oy*c-oy;}
      else {const factor=1/(1+b.amount*weight)-1;sx+=ox*factor;sy+=oy*factor;}
    }
    if(!changed)continue;
    sx=Math.max(0,Math.min(width-1.001,sx));sy=Math.max(0,Math.min(height-1.001,sy));
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    const a=(iy*width+ix)*4,b=a+4,c=a+width*4,d=c+4,out=(y*width+x)*4;
    for(let channel=0;channel<3;channel++)output[out+channel]=(input[a+channel]*(1-fx)+input[b+channel]*fx)*(1-fy)+(input[c+channel]*(1-fx)+input[d+channel]*fx)*fy;
    output[out+3]=255;
  }
}
