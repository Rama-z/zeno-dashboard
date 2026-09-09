import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/orbit-navigation.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {orbitSegmentGeometry:g} = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
test('petals expose rounded polygon boundaries with a narrow inner and broad outer side', () => {
  for(let count=1;count<=8;count++) for(let i=0;i<count;i++) {
    const s=g(i,count);
    assert.ok(Array.isArray(s.points), 'real polygon boundary required, not rotated rounded rectangles');
    assert.ok(s.outerWidth>s.innerWidth);
    assert.match(s.path,/Q/);
    assert.ok(s.points.every(p=>p.x>=0 && p.x<=100 && p.y>=0 && p.y<=100));
  }
});
test('renderer uses shape-clipped native buttons and an eight-item maximum', async () => {
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.match(main,/clip-path:\$\{geometry.clip\}/);
 assert.match(main,/paginateOrbitItems\(layerItems, orbitPage, 8\)/);
 assert.doesNotMatch(main,/class="orbit-close"/);
});
test('layer transitions are cancellable and modal focus includes the single close pill', async () => {
 const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.match(main,/orbitTransitionToken/);
 assert.match(main,/function changeOrbitLayer/);
 assert.match(main,/\.zeno-dashboard.*inert/);
 assert.match(main,/focusable\.push\(trigger\)/);
});
test('two real children form left, center Back, right rather than a vertical column', () => {
  const left=g(0,2), right=g(1,2);
  assert.ok(left.labelX < 50 && right.labelX > 50, 'Journal must be left and Materials right');
  assert.equal(left.labelY,50); assert.equal(right.labelY,50);
});

function inside(p,poly) { let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++) if((poly[i].y>p.y)!=(poly[j].y>p.y)&&p.x<(poly[j].x-poly[i].x)*(p.y-poly[i].y)/(poly[j].y-poly[i].y)+poly[i].x)c=!c;return c; }
for (const size of [327,350]) for (let count=1;count<=8;count++) {
 test(`${size}px / ${count} petals: disjoint real boundaries, center clearance and 44px inscribed target`,()=>{
  const shapes=Array.from({length:count},(_,i)=>g(i,count));
  for(const a of shapes){
   const delta=22/size*100;
   for(const [dx,dy] of [[-delta,-delta],[delta,-delta],[delta,delta],[-delta,delta]]) assert.ok(inside({x:a.labelX+dx,y:a.labelY+dy},a.points),'44px square contained');
   for(const p of a.points) assert.ok(Math.hypot(p.x-50,p.y-50)*size/100>=36,'center plus six pixel gap');
   for(const b of shapes) if(a!==b) for(const p of a.points) assert.ok(!inside(p,b.points),'no boundary intersection');
  }
 });
}
