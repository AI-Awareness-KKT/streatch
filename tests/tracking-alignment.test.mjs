import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as engine from '../docs/face-engine.mjs';
import {FaceLandmarker} from '../docs/vendor/vision_bundle.mjs';
import {drawDemo} from '../docs/face-demo.mjs';

test('both trackers read one displayed snapshot and missing faces clear stale geometry', () => {
  const operations = [];
  const elements = new Map();
  function element() {
    return {
      width: 0, height: 0, checked: false, value: '0',
      addEventListener() {},
      getContext() {
        return {
          createImageData: () => ({ data: new Uint8ClampedArray(640 * 360 * 4) }),
          drawImage: (...args) => operations.push({ type: 'snapshot', source: args[0] }),
        };
      },
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
  };
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
  points[10] = { x: .5, y: .3 };
  points[152] = { x: .5, y: .7 };
  points[234] = { x: .35, y: .5 };
  points[454] = { x: .65, y: .5 };
  let facePresent = true;
  const models = {
    hand: {
      detectForVideo(input) {
        operations.push({ type: 'hand', input });
        return { landmarks: [], handedness: [] };
      },
    },
    face: {
      detectForVideo(input) {
        operations.push({ type: 'face', input });
        return { faceLandmarks: facePresent ? [points] : [] };
      },
    },
  };
  const context = vm.createContext({
    ...engine, document, window: { addEventListener() {} }, modelsForTest: models,
    drawDemo() {}, console,
  });
  const app = readFileSync(new URL('../docs/app.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  vm.runInContext(app, context);
  vm.runInContext('models=modelsForTest; detect(100);', context);
  assert.deepEqual(operations.map(operation => operation.type), ['snapshot', 'hand', 'face']);
  assert.equal(operations[1].input, operations[2].input);
  assert.equal(operations[1].input.width, 640);
  assert.equal(operations[1].input.height, 360);
  assert.equal(vm.runInContext('face.points[1].x', context), 480);
  assert.equal(vm.runInContext('face.points[1].y', context), 270);
  vm.runInContext("state.slots.set('pinch', {mode:'active'});", context);
  facePresent = false;
  vm.runInContext('detect(160);', context);
  assert.equal(vm.runInContext('face', context), null);
  assert.equal(vm.runInContext("state.slots.get('pinch').mode", context), 'spring');
});


// Use the shipped tracker's topology as the independent reference, rather than
// repeating the application's list of landmark numbers in this test.
const ovalEdges=FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
const ovalIndices=ovalEdges.map(edge=>edge.start);
function trackedFace(transform=point=>point){
  const points=Array.from({length:478},(_,index)=>({
    x:450+(index%17)*2,y:250+Math.floor(index/17)*1.5,
  }));
  ovalIndices.forEach((index,vertex)=>{
    const angle=vertex/ovalIndices.length*Math.PI*2;
    // An asymmetric outline catches an ellipse fit that happens to match a
    // symmetrical fixture. The narrow chin and uneven cheeks are intentional.
    points[index]={x:480+Math.cos(angle)*(95+vertex%5*3),y:260+Math.sin(angle)*(140+vertex%3*5)};
  });
  return engine.faceInfo(points.map(transform));
}
function drawingContext(operations=[]){
  const context={
    createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),
    createLinearGradient:()=>({addColorStop(){}}),
  };
  for(const name of ['save','restore','setLineDash','beginPath','moveTo','lineTo','closePath','ellipse','arc','stroke','fill','fillRect','bezierCurveTo','quadraticCurveTo']){
    context[name]=(...args)=>operations.push([name,...args]);
  }
  return context;
}
function renderGuides(face){
  const operations=[],context=drawingContext(operations),elements=new Map();
  const values={scope:'face',tool:'stretch',headReach:'1.15',headShift:'0'};
  const element=id=>({
    checked:id==='guides',value:values[id]??'0',addEventListener(){},
    getContext:()=>context,
  });
  const document={
    getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},
    createElement:()=>element(),
  };
  const sandbox=vm.createContext({...engine,drawDemo,document,window:{addEventListener(){}},faceForTest:face});
  const source=readFileSync(new URL('../docs/app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  vm.runInContext(source,sandbox);
  vm.runInContext('face=faceForTest;drawGuides();',sandbox);
  return operations;
}

test('face contour uses the exact connected oval from the bundled FaceLandmarker',()=>{
  assert.equal(ovalEdges.length,36);
  ovalEdges.forEach((edge,index)=>assert.equal(edge.end,ovalEdges[(index+1)%ovalEdges.length].start));
  const face=trackedFace(),contour=engine.faceContour(face);
  assert.equal(contour.length,ovalEdges.length);
  ovalIndices.forEach((index,vertex)=>assert.equal(contour[vertex],face.points[index]));
});

test('face contour follows roll, translation, mirroring and asymmetric perspective point for point',()=>{
  const angle=.43,c=Math.cos(angle),s=Math.sin(angle);
  const transforms=[
    point=>({x:point.x+73,y:point.y-31}),
    point=>({x:(point.x-480)*c-(point.y-260)*s+510,y:(point.x-480)*s+(point.y-260)*c+280}),
    point=>({x:960-point.x,y:point.y*.85+13}),
    point=>({x:480+(point.x-480)*(.65+(point.y-260)/1000),y:point.y+(point.x-480)*.12}),
  ];
  const original=trackedFace();
  for(const transform of transforms){
    const face=trackedFace(transform),contour=engine.faceContour(face);
    assert.deepEqual(contour,ovalIndices.map(index=>transform(original.points[index])));
    ovalIndices.forEach((index,vertex)=>assert.equal(contour[vertex],face.points[index]));
  }
});

test('non-outline landmarks and bounding boxes cannot resize or shift the contour',()=>{
  const face=trackedFace(),expected=engine.faceContour(face);
  const points=face.points.slice();
  points[1]={x:-300,y:900}; // Nose outlier changes all bounding-box dimensions.
  const changed=engine.faceInfo(points);
  assert.notEqual(changed.left,face.left);
  assert.notEqual(changed.bottom,face.bottom);
  assert.deepEqual(engine.faceContour(changed),expected);
});

test('the visible camera guide draws the detected oval and eye/nose markers without an ellipse',()=>{
  const face=trackedFace(),operations=renderGuides(face);
  assert.deepEqual(operations.filter(op=>op[0]==='moveTo'||op[0]==='lineTo'),ovalIndices.map((index,vertex)=>[
    vertex===0?'moveTo':'lineTo',face.points[index].x,face.points[index].y,
  ]));
  assert.equal(operations.filter(op=>op[0]==='closePath').length,1);
  assert.equal(operations.filter(op=>op[0]==='ellipse').length,0);
  assert.deepEqual(operations.filter(op=>op[0]==='arc').map(op=>op.slice(1,3)),[1,33,263].map(index=>[face.points[index].x,face.points[index].y]));
});

test('the illustrated demo keeps its ellipse fallback without pretending its sample grid is a detected oval',()=>{
  const face=drawDemo(drawingContext());
  assert.ok(face.points.length>3&&face.points.length<468);
  assert.equal(engine.faceContour(face),null);
  assert.equal(engine.faceContour(null),null);
  const operations=renderGuides(face),ellipses=operations.filter(op=>op[0]==='ellipse');
  assert.deepEqual(ellipses,[['ellipse',(face.left+face.right)/2,(face.top+face.bottom)/2,face.width/2,face.height/2,0,0,Math.PI*2]]);
  assert.equal(operations.filter(op=>op[0]==='lineTo'||op[0]==='arc').length,0);
});
const {canvasLandmarks,fitVideo,headFrame,faceInfo}=engine;
const face=faceInfo([{x:300,y:100},{x:600,y:450},{x:450,y:250}]);
test('snapshot landmarks align with mirrored and letterboxed camera pixels',()=>{
  for(const [width,height] of [[1280,720],[640,480],[480,640]]){
    const layout=fitVideo(width,height);
    for(const mirror of [false,true]){
      for(const p of [{x:0,y:0},{x:.2,y:.7},{x:.5,y:.5},{x:1,y:1}]){
        const displayed={
          x:layout.x+(mirror?1-p.x:p.x)*layout.width,
          y:layout.y+p.y*layout.height
        };
        // Models normalize coordinates relative to the full displayed snapshot.
        const [actual]=canvasLandmarks([{x:displayed.x/960,y:displayed.y/540}]);
        assert.ok(Math.abs(actual.x-displayed.x)<1e-8);
        assert.ok(Math.abs(actual.y-displayed.y)<1e-8);
      }
    }
  }
});
test('head outline is horizontally centered unless alignment is requested',()=>{
  assert.equal(headFrame(face).center.x,(face.left+face.right)/2);
  assert.deepEqual(headFrame(face),headFrame(face,1.15,0));
});
