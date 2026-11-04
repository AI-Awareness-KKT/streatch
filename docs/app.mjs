import {W,H,FacePinchState,faceInfo,warpPixels,distance,headFrame,fitVideo} from './face-engine.mjs';
import {drawDemo} from './face-demo.mjs';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const video=$('video'),source=document.createElement('canvas'),raw=source.getContext('2d');
source.width=W;source.height=H;
const small=document.createElement('canvas');small.width=640;small.height=360;
const smallCtx=small.getContext('2d',{willReadFrequently:true});
const warped=document.createElement('canvas');warped.width=640;warped.height=360;
const warpedCtx=warped.getContext('2d');
const clean=document.createElement('canvas');clean.width=W;clean.height=H;
const cleanCtx=clean.getContext('2d');
const output=warpedCtx.createImageData(640,360),state=new FacePinchState();
let mode='off',stream=null,models=null,raf=0,lastDraw=0,lastInference=0,lastFaceAt=0;
let face=null,hands=[],lastVideo=-1,generation=0,loading=false,pointerActive=false;
let edited=false,autoHiddenGuides=false;
const hold=()=>$('hold').checked;
const settings=()=>({strength:+$('strength').value,area:+$('area').value,tool:$('tool').value,scope:$('scope').value,headReach:+$('headReach').value,headShift:+$('headShift').value});
const message=text=>{$('message').textContent=text;};
function text(id,value){if($(id).textContent!==value)$(id).textContent=value;}
function syncSaved(){text('heldCount',String(state.heldCount));$('undo').disabled=state.heldCount===0;$('bigHead').disabled=mode==='off'||!face;$('photo').disabled=mode==='off';}
function reset(){state.reset();pointerActive=false;edited=false;if(autoHiddenGuides)$('guides').checked=true;autoHiddenGuides=false;syncSaved();}
function stop(clear=true){
  generation++;mode='off';cancelAnimationFrame(raf);stream?.getTracks().forEach(track=>track.stop());stream=null;
  video.pause();video.srcObject=null;reset();hands=[];face=null;lastDraw=0;lastVideo=-1;lastInference=0;lastFaceAt=0;
  loading=false;$('start').disabled=false;$('cameraToggle').disabled=false;$('start').textContent='Start camera';$('cameraToggle').textContent='Start camera';
  $('compare').checked=false;
  if(clear){ctx.clearRect(0,0,W,H);cleanCtx.clearRect(0,0,W,H);$('welcome').hidden=false;text('stageLabel','CAMERA OFF');text('modeLabel','TWO HANDS · WHOLE HEAD');text('faceStatus','Waiting');text('handStatus','—');text('effectStatus','Ready');}
}
function demo(){
  stop(false);mode='demo';face=drawDemo(raw);$('welcome').hidden=true;
  message('Demo: drag the hair, ears or face. Try the different effects, Big head, and Save photo. Start the camera to use your own head and hands.');
  text('stageLabel','ILLUSTRATED DEMO');text('modeLabel','DRAG THE HEAD');raf=requestAnimationFrame(render);
}
async function startCamera(){
  stop();loading=true;const ticket=generation;
  $('start').disabled=true;$('cameraToggle').disabled=true;$('start').textContent='Loading trackers…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Open this app in its own HTTPS browser tab to allow camera access.');
    if(!models){
      const probe=document.createElement('canvas'),gl=probe.getContext('webgl2')||probe.getContext('webgl');
      if(!gl)throw Error('Hand and face tracking need WebGL. Enable hardware acceleration in Chrome or Edge, restart the browser, and try again. The illustrated demo works without it.');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      message('Loading hand and face trackers. The first start may take a moment.');
      const {HandLandmarker,FaceLandmarker,FilesetResolver}=await import('./vendor/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks('./vendor/wasm');
      const hand=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./vendor/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minTrackingConfidence:.55});
      try{
        const faceModel=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./vendor/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
        models={hand,face:faceModel};
      }catch(error){hand.close();throw error;}
    }
    if(ticket!==generation)return;
    message('Allow webcam access in your browser.');
    const camera=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:540},frameRate:{ideal:30,max:30},facingMode:'user'},audio:false});
    if(ticket!==generation){camera.getTracks().forEach(t=>t.stop());return;}
    stream=camera;video.srcObject=stream;await video.play();
    if(ticket!==generation)return;
    loading=false;mode='camera';$('start').disabled=false;$('cameraToggle').disabled=false;$('cameraToggle').textContent='Stop camera';$('start').textContent='Start camera';$('welcome').hidden=true;
    text('stageLabel','LIVE · HEAD PLAYGROUND');text('modeLabel','TWO HANDS · WHOLE HEAD');
    message('Fit your whole head in the frame. Pinch near your hair, ear or face and slowly pull. Adjust Head coverage to fit your hairstyle.');
    raf=requestAnimationFrame(render);
  }catch(error){
    if(ticket!==generation)return;
    stop();
    const errors={NotAllowedError:'Camera access was blocked. Allow the camera for this site in the address bar and try again.',NotFoundError:'No webcam was found. Connect a camera, or try the illustrated demo.',NotReadableError:'Your camera is busy. Close other apps using it, then try again.'};
    message(errors[error.name]||error.message);
  }
}
function pixelPoints(points){const layout=fitVideo(video.videoWidth,video.videoHeight);return points.map(p=>({x:layout.x+($('mirror').checked?1-p.x:p.x)*layout.width,y:layout.y+p.y*layout.height}));}
function detect(now){
  const result=models.hand.detectForVideo(video,now);
  const used=new Set();
  hands=result.landmarks.map((points,i)=>{
    let id=result.handedness[i]?.[0]?.categoryName||`hand${i}`;
    if(used.has(id))id+=i;used.add(id);
    return {id,points:pixelPoints(points)};
  });
  const resultFace=models.face.detectForVideo(video,now);
  if(resultFace.faceLandmarks[0]){
    let pts=pixelPoints(resultFace.faceLandmarks[0]);
    if(face&&face.points.length===pts.length&&distance(face.points[1],pts[1])<70)pts=pts.map((p,i)=>({x:p.x*.7+face.points[i].x*.3,y:p.y*.7+face.points[i].y*.3}));
    face=faceInfo(pts);lastFaceAt=now;
  }else if(now-lastFaceAt>450){face=null;for(const slot of state.slots.values())if(slot.mode==='active')slot.mode='spring';}
  if(!$('compare').checked)state.updateHands(hands,face,now,hold(),settings());
}
function drawGuides(){
  if(!$('guides').checked)return;
  if(face){
    ctx.save();ctx.strokeStyle='#bcb2e360';ctx.lineWidth=1.5;ctx.setLineDash([4,7]);
    ctx.beginPath();
    if($('scope').value==='head'){
      const frame=headFrame(face,+$('headReach').value,+$('headShift').value);
      ctx.ellipse(frame.center.x,frame.center.y,frame.rx,frame.ry,Math.atan2(frame.ux.y,frame.ux.x),0,Math.PI*2);
    }else ctx.ellipse((face.left+face.right)/2+face.width*(+$('headShift').value),(face.top+face.bottom)/2,face.width/2+18,face.height/2+10,0,0,Math.PI*2);
    ctx.stroke();ctx.restore();
  }
  for(const hand of hands){
    const p=hand.points,mid={x:(p[4].x+p[8].x)/2,y:(p[4].y+p[8].y)/2};
    const isClosed=state.latches.get(hand.id)?.closed;
    ctx.strokeStyle=isClosed?'#e4c2ff':'#9ce4c6';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(p[4].x,p[4].y);ctx.lineTo(p[8].x,p[8].y);ctx.stroke();
    ctx.beginPath();ctx.arc(mid.x,mid.y,isClosed?9:6,0,Math.PI*2);ctx.stroke();
  }
}
function render(now){
  if(mode==='off')return;
  raf=requestAnimationFrame(render);
  if(now-lastDraw<32)return;
  const dt=lastDraw?(now-lastDraw)/1000:1/30;lastDraw=now;
  try{
    if(mode==='camera'){
      if(video.readyState<2)return;
      const layout=fitVideo(video.videoWidth,video.videoHeight);
      raw.fillStyle='#191d27';raw.fillRect(0,0,W,H);
      raw.save();if($('mirror').checked){raw.translate(W,0);raw.scale(-1,1);}raw.drawImage(video,layout.x,layout.y,layout.width,layout.height);raw.restore();
      if(video.currentTime!==lastVideo&&now-lastInference>48){detect(now);lastInference=now;lastVideo=video.currentTime;}
    }
    state.tick(face,dt,hold());
    if(state.slots.size&&!edited){
      edited=true;
      if($('guides').checked){$('guides').checked=false;autoHiddenGuides=true;}
    }
    const warps=state.warps(face,+$('strength').value,+$('area').value);
    if(!$('compare').checked&&warps.some(w=>Math.hypot(w.delta.x,w.delta.y)>.3||Math.abs(w.amount)>.001)){
      smallCtx.drawImage(source,0,0,640,360);
      const pixels=smallCtx.getImageData(0,0,640,360);
      warpPixels(pixels.data,output.data,640,360,warps,640/W);
      warpedCtx.putImageData(output,0,0);cleanCtx.drawImage(warped,0,0,W,H);
    }else cleanCtx.drawImage(source,0,0);
    ctx.drawImage(clean,0,0);
    if(!$('compare').checked)drawGuides();
    text('faceStatus',face?(mode==='demo'?'Demo face':'Detected'):'Searching');
    text('handStatus',mode==='demo'?'Mouse / touch':hands.length?`${hands.length} detected`:'Show your hand');
    if(mode==='camera'&&face){
      const f=headFrame(face,+$('headReach').value,+$('headShift').value),layout=fitVideo(video.videoWidth,video.videoHeight);
      const ex=Math.hypot(f.rx*f.ux.x,f.ry*f.uy.x),ey=Math.hypot(f.rx*f.ux.y,f.ry*f.uy.y);
      const outside=f.center.x-ex<layout.x||f.center.x+ex>layout.x+layout.width||f.center.y-ey<layout.y||f.center.y+ey>layout.y+layout.height;
      text('modeLabel',outside?'STEP BACK · FIT WHOLE HEAD':$('scope').value==='head'?'TWO HANDS · WHOLE HEAD':'TWO HANDS · FACE ONLY');
    }
    const active=[...state.slots.values()].some(s=>s.mode==='active'),held=state.heldCount;
    const status=$('compare').checked?'Original view':active?(held?`Editing · ${held} saved`:'Editing'):held?`${held} effect${held===1?'':'s'} held`:warps.length?'Springing back':state.rejected?'Pinch inside the outline':mode==='demo'?'Drag the head':face?'Pinch near your head':'Show your face to track your head';
    text('effectStatus',status);
    syncSaved();
  }catch(error){stop();message(`Tracking stopped: ${error.message}. Try starting again, or use the demo.`);}
}
function point(event){
  const bounds=canvas.getBoundingClientRect(),scale=Math.min(bounds.width/W,bounds.height/H);
  return {x:(event.clientX-bounds.left-(bounds.width-W*scale)/2)/scale,y:(event.clientY-bounds.top-(bounds.height-H*scale)/2)/scale};
}
canvas.addEventListener('pointerdown',event=>{
  if(mode==='off'||$('compare').checked)return;
  const p=point(event);
  if(state.begin('pointer',p,face,settings())){pointerActive=true;canvas.setPointerCapture(event.pointerId);event.preventDefault();}
});
canvas.addEventListener('pointermove',event=>{if(pointerActive)state.move('pointer',point(event),face);});
function pointerEnd(){if(pointerActive){state.release('pointer',hold(),settings());pointerActive=false;}}
canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('lostpointercapture',pointerEnd);
$('start').addEventListener('click',startCamera);
$('cameraToggle').addEventListener('click',()=>{if(mode==='camera'||loading){stop();message('Camera stopped. Start it again, or try the demo.');}else startCamera();});
$('demo').addEventListener('click',demo);$('demoToggle').addEventListener('click',demo);$('reset').addEventListener('click',reset);
$('undo').addEventListener('click',()=>{state.undoLast();syncSaved();});
$('bigHead').addEventListener('click',()=>{
  if(!face)return;
  const opts=settings(),frame=headFrame(face,opts.headReach,opts.headShift);
  const preset={...opts,tool:'inflate',scope:'head',strength:1,area:Math.max(frame.rx,frame.ry)*1.6/face.width};
  if(state.begin('preset',frame.center,face,preset)){
    state.move('preset',{x:frame.center.x+face.width*.3,y:frame.center.y},face);
    state.release('preset',true,preset);$('hold').checked=true;$('compare').checked=false;syncSaved();
    message('Big head added. Add more effects with Keep shape, compare with the original, or save a photo. Undo last removes this look.');
  }
});
$('photo').addEventListener('click',()=>{
  if(mode==='off')return;
  const snapshot=document.createElement('canvas');snapshot.width=W;snapshot.height=H;snapshot.getContext('2d').drawImage(clean,0,0);
  snapshot.toBlob(blob=>{
    if(!blob){message('Could not create the photo. Please try again.');return;}
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`gum-gum-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    message('Photo downloaded to your device. It contains the image without guides or controls.');
  },'image/png');
});
$('compare').addEventListener('change',()=>{
  for(const [id,slot]of state.slots)if(slot.mode==='active')state.release(id,hold(),settings());
  state.latches.clear();pointerActive=false;
});
function toolHint(){
  const hints={stretch:'Pinch and pull to stretch.',inflate:'Pinch and move to inflate the area around your grab.',shrink:'Pinch and move to shrink the area around your grab.',twist:'Pinch and move sideways to twist. Left and right swirl in opposite directions.'};
  text('toolHint',`${hints[$('tool').value]} ${$('scope').value==='head'?'Hair and ears are editable too. Increase Head coverage for taller hair.':'Face only limits where a new grab can start.'}`);
  $('headReach').disabled=$('scope').value!=='head';
}
$('tool').addEventListener('change',toolHint);$('scope').addEventListener('change',toolHint);
$('headReach').addEventListener('input',()=>text('headReachValue',`${Number($('headReach').value).toFixed(2)}×`));
$('headShift').addEventListener('input',()=>{
  const shift=Math.round(Number($('headShift').value)*100);
  text('headShiftValue',shift===0?'Centered':`${Math.abs(shift)}% ${shift>0?'right':'left'}`);
});
$('guides').addEventListener('change',()=>{autoHiddenGuides=false;});
$('hold').addEventListener('change',()=>{
  state.tick(face,0,hold());syncSaved();
  message(hold()?'Keep shape is on. Release each pull to save it, then pinch again to add another. Undo last removes one saved stretch. Strength and area apply to new stretches.':'Keep shape is off. Saved stretches spring back when you release them.');
});
$('mirror').addEventListener('change',()=>{reset();face=null;hands=[];lastVideo=-1;if(mode==='demo')face=drawDemo(raw);});
$('strength').addEventListener('input',()=>text('strengthValue',`${Number($('strength').value).toFixed(1)}×`));
$('area').addEventListener('input',()=>text('areaValue',+$('area').value<.35?'Small':+$('area').value>.5?'Large':'Medium'));
window.addEventListener('keydown',event=>{
  if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
  if(event.key.toLowerCase()==='r')reset();
  if(event.key.toLowerCase()==='h')$('guides').click();
  if(event.code==='Space'&&event.target.tagName!=='BUTTON'){event.preventDefault();$('mirror').click();}
  if(event.key==='Escape'){stop();message('Camera stopped.');}
});
window.addEventListener('pagehide',()=>stop());
