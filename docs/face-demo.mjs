import {faceInfo} from './face-engine.mjs';
export function drawDemo(ctx){
  const gradient=ctx.createLinearGradient(0,0,960,540);gradient.addColorStop(0,'#292e42');gradient.addColorStop(1,'#192329');ctx.fillStyle=gradient;ctx.fillRect(0,0,960,540);
  ctx.fillStyle='#ffffff08';for(let x=30;x<960;x+=36)for(let y=25;y<540;y+=36){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}
  const ellipse=(x,y,rx,ry,color)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
  ellipse(480,564,175,143,'#7d8cdb');ellipse(480,440,40,65,'#dba77f');
  ellipse(369,280,19,33,'#e3ae84');ellipse(591,280,19,33,'#e3ae84');
  ellipse(480,266,111,154,'#f0bf94');
  ctx.fillStyle='#40313a';ctx.beginPath();ctx.moveTo(370,251);ctx.bezierCurveTo(330,77,585,39,593,247);ctx.bezierCurveTo(566,230,574,169,537,177);ctx.bezierCurveTo(477,200,407,151,389,226);ctx.closePath();ctx.fill();
  ellipse(431,264,25,29,'#fff6e7');ellipse(529,264,25,29,'#fff6e7');
  ellipse(435,265,11,16,'#39353a');ellipse(525,265,11,16,'#39353a');ellipse(438,259,3,4,'#fff');ellipse(528,259,3,4,'#fff');
  ctx.strokeStyle='#59404a';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(407,226);ctx.quadraticCurveTo(429,216,450,228);ctx.moveTo(510,228);ctx.quadraticCurveTo(530,216,552,226);ctx.stroke();
  ctx.strokeStyle='#ce9069';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(479,272);ctx.quadraticCurveTo(460,309,484,310);ctx.stroke();
  ellipse(411,316,22,12,'#e79783');ellipse(549,316,22,12,'#e79783');
  ctx.fillStyle='#713f47';ctx.beginPath();ctx.moveTo(439,342);ctx.quadraticCurveTo(480,396,521,342);ctx.quadraticCurveTo(480,360,439,342);ctx.fill();
  ctx.fillStyle='#fff8e8';ctx.beginPath();ctx.moveTo(448,347);ctx.quadraticCurveTo(480,360,512,347);ctx.lineTo(503,360);ctx.quadraticCurveTo(480,366,457,360);ctx.closePath();ctx.fill();
  // Dense sample landmarks cover the illustrated face for the same grab logic.
  const points=[];
  for(let y=190;y<=408;y+=12)for(let x=375;x<=585;x+=12)if(((x-480)/108)**2+((y-270)/150)**2<1)points.push({x,y});
  return faceInfo(points);
}
