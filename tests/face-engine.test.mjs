import test from 'node:test';
import assert from 'node:assert/strict';
import {FacePinchState,faceInfo,samplePosition,warpPixels,headFrame,insideHead,fitVideo} from '../docs/face-engine.mjs';
const face=faceInfo([{x:300,y:100},{x:600,y:450},{x:450,y:250},{x:350,y:270},{x:550,y:270}]);
function hand(x,opening=20){
  const points=Array.from({length:21},()=>({x,y:250}));
  points[5]={x:x-50,y:300};points[17]={x:x+50,y:300};
  points[4]={x:x-opening/2,y:250};points[8]={x:x+opening/2,y:250};
  return points;
}
test('grabs require a nearby face feature',()=>{
  const s=new FacePinchState();
  assert.equal(s.begin('pointer',{x:20,y:20},face),false);
  assert.equal(s.begin('pointer',{x:450,y:250},null),false);
  assert.equal(s.begin('pointer',{x:450,y:250},face),true);
});
test('the dragged destination samples the original facial feature',()=>{
  const s=new FacePinchState();s.begin('pointer',{x:450,y:250},face);s.move('pointer',{x:530,y:260},face);
  const warps=s.warps(face,1,.4);
  assert.deepEqual(samplePosition(530,260,warps),{x:450,y:250});
  assert.deepEqual(samplePosition(0,0,warps),{x:0,y:0});
});
test('pinch hysteresis keeps a grab through small finger movements',()=>{
  const s=new FacePinchState();s.updateHands([{id:'Left',points:hand(450)}],face,100,false);
  s.updateHands([{id:'Left',points:hand(510,55)}],face,150,false);
  assert.equal(s.slots.get('Left').mode,'active');assert.equal(s.slots.get('Left').delta.x,60);
  s.updateHands([{id:'Left',points:hand(510,80)}],face,200,false);
  assert.equal(s.slots.get('Left').mode,'spring');
});
test('two hands can stretch independently and lost hands release',()=>{
  const s=new FacePinchState();s.updateHands([{id:'Left',points:hand(350)},{id:'Right',points:hand(550)}],face,100,false);
  s.updateHands([{id:'Left',points:hand(320)},{id:'Right',points:hand(580)}],face,150,false);
  assert.equal(s.slots.size,2);assert.equal(s.slots.get('Left').delta.x,-30);assert.equal(s.slots.get('Right').delta.x,30);
  s.updateHands([],face,400,false);assert.ok([...s.slots.values()].every(slot=>slot.mode==='spring'));
});
test('held shapes persist and then return smoothly when hold is disabled',()=>{
  const s=new FacePinchState();s.begin('pointer',{x:450,y:250},face);s.move('pointer',{x:530,y:260},face);s.release('pointer',true);
  s.tick(face,.03,true);assert.equal(s.heldCount,1);assert.equal([...s.slots.values()][0].delta.x,80);
  for(let i=0;i<100;i++)s.tick(face,.03,false);
  assert.equal(s.slots.size,0);
});
test('face anchors follow the current face while dragging is bounded',()=>{
  const s=new FacePinchState();s.begin('pointer',{x:450,y:250},face);s.move('pointer',{x:5000,y:250},face);
  assert.ok(s.slots.get('pointer').delta.x<=face.width*.95);
  const moved=faceInfo(face.points.map(p=>({x:p.x+30,y:p.y+10})));s.tick(moved,.03,false);
  assert.deepEqual(s.slots.get('pointer').anchor,{x:480,y:260});
});
test('pixel warp moves image content and leaves distant pixels intact',()=>{
  const width=64,height=36,src=new Uint8ClampedArray(width*height*4),out=new Uint8ClampedArray(src.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){let i=(y*width+x)*4;src[i]=x*4;src[i+1]=y*7;src[i+3]=255;}
  warpPixels(src,out,width,height,[],1);assert.deepEqual(out,src);
  warpPixels(src,out,width,height,[{anchor:{x:30,y:18},delta:{x:7,y:0},radius:15}],1);
  assert.equal(out[(18*width+37)*4],120);assert.deepEqual(out.slice(0,4),src.slice(0,4));
});
test('repeated grabs with the same pointer accumulate and undo in release order',()=>{
  const s=new FacePinchState();
  for(const [x,dx]of [[350,-30],[450,20],[550,40]]){
    s.begin('pointer',{x,y:270},face);s.move('pointer',{x:x+dx,y:270},face);s.release('pointer',true);
  }
  assert.equal(s.heldCount,3);
  assert.deepEqual(s.warps(face,1).map(w=>w.delta.x),[-30,20,40]);
  s.begin('pointer',{x:450,y:250},face);
  assert.equal(s.heldCount,3);
  s.undoLast();assert.equal(s.heldCount,2);
  assert.deepEqual(s.warps(face,1).filter(w=>w.mode==='held').map(w=>w.delta.x),[-30,20]);
  assert.equal(s.slots.get('pointer').mode,'active');
  s.reset();assert.equal(s.heldCount,0);assert.equal(s.slots.size,0);assert.equal(s.undoLast(),false);
});
test('the same tracked hand can release and grab a second feature without erasing the first',()=>{
  const s=new FacePinchState();
  let now=100;
  for(const [x,dx]of [[350,-20],[550,25]]){
    s.updateHands([{id:'Left',points:hand(x)}],face,now,true);
    s.updateHands([{id:'Left',points:hand(x+dx)}],face,now+50,true);
    s.updateHands([{id:'Left',points:hand(x+dx,80)}],face,now+100,true);
    now+=150;
  }
  assert.equal(s.heldCount,2);assert.deepEqual(s.warps(face,1).map(w=>w.delta.x),[-20,25]);
  for(let i=0;i<100;i++)s.tick(face,.03,false);
  assert.equal(s.heldCount,0);assert.equal(s.slots.size,0);
});
test('saved stretches retain their strength and size while new stretches use current settings',()=>{
  const s=new FacePinchState();
  s.begin('pointer',{x:450,y:250},face);s.move('pointer',{x:470,y:250},face);
  s.release('pointer',true,{strength:1.5,area:.3});s.release('pointer',true);
  s.begin('pointer',{x:550,y:270},face);s.move('pointer',{x:570,y:270},face);
  const warps=s.warps(face,2,.5);
  assert.equal(s.heldCount,1);assert.equal(warps[0].delta.x,30);assert.equal(warps[0].radius,90);
  assert.equal(warps[1].delta.x,40);assert.equal(warps[1].radius,150);
  s.tick(null,.03,true);assert.equal(s.heldCount,1);
  assert.ok(s.warps(null,2,.5).every(w=>w.mode!=='held'));
});
test('whole-head selection reaches the scalp and ears beyond facial landmarks',()=>{
  const s=new FacePinchState(),frame=headFrame(face);
  const scalp={x:frame.center.x,y:frame.center.y-frame.ry*.9};
  const ear={x:frame.center.x+frame.rx*.92,y:frame.center.y};
  assert.ok(scalp.y<face.top);assert.ok(ear.x>face.right);
  assert.equal(s.begin('scalp',scalp,face,{scope:'face'}),false);
  assert.equal(s.begin('scalp',scalp,face,{scope:'head'}),true);
  assert.equal(s.begin('ear',ear,face,{scope:'head'}),true);
  assert.equal(s.begin('background',{x:50,y:50},face,{scope:'head'}),false);
  assert.ok(headFrame(face,1.7).rx>frame.rx);assert.ok(headFrame(face,1.7).ry>frame.ry);
});
test('head anchors follow translated and rolled head frames',()=>{
  const s=new FacePinchState();
  const angle=.22,c=Math.cos(angle),sn=Math.sin(angle);
  const transform=q=>({x:q.x*c-q.y*sn+40,y:q.x*sn+q.y*c+20});
  // An actual face has stable landmark indices; use a 478-point fixture.
  const landmarks=Array.from({length:478},()=>({x:450,y:250}));
  landmarks[10]={x:450,y:100};landmarks[152]={x:450,y:450};landmarks[234]={x:300,y:260};landmarks[454]={x:600,y:260};
  const actual=faceInfo(landmarks);s.reset();s.begin('pointer',{x:450,y:40},actual,{scope:'head'});
  const before=s.slots.get('pointer').anchor;s.tick(faceInfo(landmarks.map(transform)),.03,true);
  const after=s.slots.get('pointer').anchor,expected=transform(before);
  assert.ok(Math.abs(after.x-expected.x)<1e-8);assert.ok(Math.abs(after.y-expected.y)<1e-8);
});
test('inflate, shrink and twist perform different inverse image mappings',()=>{
  const base={anchor:{x:100,y:100},delta:{x:30,y:0},radius:80};
  const inflated=samplePosition(120,100,[{...base,kind:'inflate',amount:.8}]);
  const shrunk=samplePosition(120,100,[{...base,kind:'shrink',amount:-.5}]);
  const twisted=samplePosition(120,100,[{...base,kind:'twist',amount:.8}]);
  assert.ok(inflated.x>100&&inflated.x<120);assert.ok(shrunk.x>120);assert.ok(twisted.y<100);
  assert.deepEqual(samplePosition(100,100,[{...base,kind:'twist',amount:1}]),{x:100,y:100});
  for(const kind of ['inflate','shrink','twist'])assert.deepEqual(samplePosition(300,300,[{...base,kind,amount:.8}]),{x:300,y:300});
});
test('different saved tools accumulate, retain their type, and spring back',()=>{
  const s=new FacePinchState();
  for(const tool of ['stretch','inflate','shrink','twist']){
    s.begin('pointer',{x:450,y:250},face,{scope:'head',tool});s.move('pointer',{x:490,y:270},face);s.release('pointer',true,{strength:1,area:.5});
  }
  assert.equal(s.heldCount,4);assert.deepEqual(s.warps(face).map(w=>w.kind),['stretch','inflate','shrink','twist']);
  assert.ok(s.warps(face)[1].amount>0);assert.ok(s.warps(face)[2].amount<0);
  s.undoLast();assert.deepEqual(s.warps(face).map(w=>w.kind),['stretch','inflate','shrink']);
  for(let i=0;i<100;i++)s.tick(face,.03,false);assert.equal(s.slots.size,0);
});
test('camera fitting preserves the entire image for wide and portrait cameras',()=>{
  assert.deepEqual(fitVideo(1280,720),{x:0,y:0,width:960,height:540});
  assert.deepEqual(fitVideo(640,480),{x:120,y:0,width:720,height:540});
  const portrait=fitVideo(480,640);assert.equal(portrait.height,540);assert.equal(portrait.y,0);assert.ok(portrait.x>0);
});
test('all rendered tools agree with their inverse mappings on actual pixels',()=>{
  const width=80,height=60,src=new Uint8ClampedArray(width*height*4),out=new Uint8ClampedArray(src.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;src[i]=x*3;src[i+1]=y*4;src[i+3]=255;}
  for(const [kind,amount]of [['stretch',0],['inflate',.7],['shrink',-.5],['twist',.9]]){
    const warps=[{anchor:{x:40,y:30},delta:{x:9,y:4},radius:25,kind,amount}];
    warpPixels(src,out,width,height,warps,1);
    for(const [x,y]of [[43,33],[49,34],[36,38]]){
      const point=samplePosition(x,y,warps),i=(y*width+x)*4;
      assert.ok(Math.abs(out[i]-point.x*3)<=1,kind);assert.ok(Math.abs(out[i+1]-point.y*4)<=1,kind);
    }
  }
});
test('outline alignment moves right and applies to the actual grab region',()=>{
  const centred=headFrame(face,1.15,0),shifted=headFrame(face,1.15,.1);
  assert.equal(shifted.center.x-centred.center.x,face.width*.1);
  assert.equal(shifted.center.y,centred.center.y);
  const right=headFrame(face,1.15,.3),p={x:right.center.x+right.rx*.9,y:right.center.y};
  const s=new FacePinchState();
  assert.equal(s.begin('pointer',p,face,{scope:'head',headShift:.3}),true);
  assert.equal(s.begin('other',p,face,{scope:'head',headShift:-.3}),false);
  assert.deepEqual(shifted.origin,centred.origin);
});
