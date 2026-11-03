export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export class RubberState {
  constructor(){ this.reset(); }
  reset(){ this.mode='idle'; this.anchor=null; this.target=null; this.color=null; }
  release(){ if(this.mode==='active') this.mode='snapping'; }
  update(points,dt){
    this.pinch=points?distance(points[4],points[8]):null;
    if(points){
      const target={x:(points[4].x+points[8].x)/2,y:(points[4].y+points[8].y)/2};
      if(this.mode==='idle' && this.pinch<42){
        this.anchor={...points[5]}; this.target=target; this.mode='active'; this.color=null;
      }
      if(this.mode==='active'){
        this.target=target;
        if(this.pinch>65) this.release();
      }
    } else this.release();
    if(this.mode==='snapping'){
      const alpha=1-Math.pow(1-0.18,Math.min(dt,0.1)*60);
      this.target={x:this.target.x+(this.anchor.x-this.target.x)*alpha,y:this.target.y+(this.anchor.y-this.target.y)*alpha};
      if(distance(this.anchor,this.target)<8) this.reset();
    }
  }
}
export function tubeGeometry(anchor,target){
  const length=distance(anchor,target);
  if(length<10)return null;
  const normal={x:-(target.y-anchor.y)/length,y:(target.x-anchor.x)/length};
  const bulge=Math.min(120,length*0.22);
  const control={x:(anchor.x+target.x)/2+normal.x*bulge,y:(anchor.y+target.y)/2+normal.y*bulge};
  const base=34-Math.min(1,length/450)*14;
  const left=[],right=[],highlight=[];
  for(let i=0;i<40;i++){
    const t=i/39,u=1-t;
    const p={x:u*u*anchor.x+2*u*t*control.x+t*t*target.x,y:u*u*anchor.y+2*u*t*control.y+t*t*target.y};
    const dx=2*u*(control.x-anchor.x)+2*t*(target.x-control.x);
    const dy=2*u*(control.y-anchor.y)+2*t*(target.y-control.y);
    const norm=Math.hypot(dx,dy)||1,n={x:-dy/norm,y:dx/norm};
    const radius=u*base+t*12;
    left.push({x:p.x+n.x*radius,y:p.y+n.y*radius});
    right.push({x:p.x-n.x*radius,y:p.y-n.y*radius});
    highlight.push({x:p.x-n.x*radius*.35,y:p.y-n.y*radius*.35});
  }
  return {polygon:[...left,...right.reverse()],highlight};
}
