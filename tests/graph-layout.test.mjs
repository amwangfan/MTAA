import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, step, advanceAlpha, ALPHA_MIN, ALPHA_TARGET_DRAG, MAX_MOVE } from '../lib/graph-layout.js';

const node = (id, kind = 'member') => ({ id, kind, label: id });
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('repulsion separates overlapping nodes', () => {
  const sim = createSimulation([node('a'), node('b')], [], { width: 400, height: 300 });
  const [a, b] = sim.state.nodes;
  a.x = b.x = 200; a.y = b.y = 150;
  for (let i = 0; i < 90; i++) sim.tick();
  assert.ok(dist2(a, b) > 40, `斥力应把重叠节点分开，实际 ${dist2(a, b).toFixed(1)}`);
});

test('per-tick displacement never exceeds MAX_MOVE (no jump)', () => {
  const sim = createSimulation(
    [node('a'), node('b'), node('c'), node('d'), node('e')],
    [{ id: 'ab', from: 'a', to: 'b', weight: 1 }, { id: 'cd', from: 'c', to: 'd', weight: 1 }],
    { width: 400, height: 300 });
  sim.state.nodes.forEach(nd => { nd.x = 200; nd.y = 150; }); // 全部叠在一起，最坏情形
  for (let i = 0; i < 120; i++) {
    const before = sim.state.nodes.map(nd => ({ x: nd.x, y: nd.y }));
    sim.tick();
    sim.state.nodes.forEach((nd, k) => {
      const moved = Math.hypot(nd.x - before[k].x, nd.y - before[k].y);
      assert.ok(moved <= MAX_MOVE + 1e-9, `第${i}帧节点${nd.id}位移 ${moved.toFixed(2)} 超过上限`);
    });
  }
});

test('collision relaxes progressively in a single tick (no teleport)', () => {
  const sim = createSimulation([node('a'), node('b')], [], { width: 400, height: 300 });
  const [a, b] = sim.state.nodes;
  a.x = b.x = 200; a.y = b.y = 150;
  sim.state.alpha = 0; sim.state.alphaTarget = 0; // 只留碰撞/积分路径
  step(sim.state);
  const d = dist2(a, b);
  const minDist = a.r + b.r + 2;
  assert.ok(d > 0 && d < minDist, `单帧应渐进分离而非瞬时分开：${d.toFixed(2)} / 目标 ${minDist}`);
  assert.ok(d <= 2 * MAX_MOVE, `单帧分离幅度应受位移上限约束，实际 ${d.toFixed(2)}`);
  for (let i = 0; i < 60; i++) step(sim.state); // 多轮后仍应最终不重叠
  assert.ok(dist2(a, b) >= minDist - 2, `软碰撞多轮后应不重叠，实际 ${dist2(a, b).toFixed(2)}`);
});

test('higher weight link pulls closer than low weight', () => {
  const settle = weight => {
    const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b', weight }], { width: 960, height: 450 });
    const [a, b] = sim.state.nodes;
    a.x = 370; b.x = 590; a.y = b.y = 225;
    sim.state.alpha = 1; sim.state.alphaTarget = 1;
    for (let i = 0; i < 500; i++) sim.tick();
    return dist2(a, b);
  };
  const high = settle(1.0); const low = settle(0.2);
  assert.ok(high < low - 60, `高权重应更近：high=${high.toFixed(1)} low=${low.toFixed(1)}`);
});

test('default link weight is 0.6 (backward compatible)', () => {
  const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b' }], { width: 960, height: 450 });
  assert.equal(sim.state.links[0].weight, 0.6);
});

test('drag target lerps smoothly instead of teleporting', () => {
  const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b', weight: 0.6 }], { width: 600, height: 400 });
  for (let i = 0; i < 300; i++) sim.tick();
  const a = sim.state.nodes[0];
  const from = { x: a.x, y: a.y };
  sim.setDrag('a', from.x + 100, from.y);
  const after1 = { x: a.x, y: a.y };
  sim.tick();
  const moved = Math.hypot(a.x - after1.x, a.y - after1.y);
  assert.ok(moved > 0 && moved < 60, `拖拽首帧应平滑跟随(lerp)而非瞬移：${moved.toFixed(1)}px`);
  for (let i = 0; i < 60; i++) sim.tick();
  assert.ok(Math.abs(a.x - (from.x + 100)) < 2, `lerp 应最终跟上指针，差 ${Math.abs(a.x - from.x - 100).toFixed(2)}`);
  sim.endDrag('a');
  assert.equal(a.fx, null); assert.equal(a.fy, null);
});

test('drag reheats gradually (alphaTarget) then settles after release', () => {
  const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b', weight: 0.6 }], { width: 600, height: 400 });
  for (let i = 0; i < 500; i++) sim.tick();
  assert.ok(sim.alpha < 0.05, `静置后 alpha 应很低，实际 ${sim.alpha}`);
  const settled = sim.alpha;
  sim.setDrag('a', 120, 120);
  assert.equal(sim.state.alphaTarget, ALPHA_TARGET_DRAG);
  for (let i = 0; i < 30; i++) sim.tick();
  assert.ok(sim.alpha > settled, '拖拽期间 alpha 应渐升保持热');
  sim.endDrag('a');
  assert.equal(sim.state.alphaTarget, 0);
  for (let i = 0; i < 500; i++) sim.tick();
  assert.ok(sim.alpha < 0.05, `松手后应 settle，实际 ${sim.alpha}`);
});

test('fx/fy locked node follows pointer while neighbour moves away', () => {
  const sim = createSimulation([node('a'), node('b'), node('c')],
    [{ id: 'ab', from: 'a', to: 'b', weight: 0.6 }, { id: 'ac', from: 'a', to: 'c', weight: 0.6 }],
    { width: 600, height: 400 });
  const [a, b] = sim.state.nodes;
  sim.setDrag('a', 100, 100);
  for (let i = 0; i < 60; i++) sim.tick();
  const before = { x: b.x, y: b.y };
  sim.setDrag('a', 300, 100);
  for (let i = 0; i < 40; i++) sim.tick();
  assert.ok(Math.hypot(a.x - 300, a.y - 100) < 3, '被拖节点应跟上指针');
  assert.ok(Math.hypot(b.x - before.x, b.y - before.y) > 1, '邻居应动态退避');
});

test('alpha decays toward alphaMin and stops', () => {
  const sim = createSimulation([node('a')], [], { width: 300, height: 300 });
  let stopped = false;
  for (let i = 0; i < 3000; i++) {
    const alpha = sim.tick();
    if (alpha === 0) { stopped = true; break; }
  }
  assert.ok(stopped, `alpha 应收敛停止，实际 ${sim.alpha}`);
  assert.ok(sim.alpha <= ALPHA_MIN, `停止后 alpha 应为 0，实际 ${sim.alpha}`);
});

test('3D: z participates in forces (changes under relaxation)', () => {
  const sim = createSimulation([node('a'), node('b'), node('c'), node('d')],
    [{ id: 'ab', from: 'a', to: 'b', weight: 0.8 }, { id: 'cd', from: 'c', to: 'd', weight: 0.8 }],
    { width: 600, height: 400, dimensions: 3 });
  const z0 = sim.state.nodes.map(nd => nd.z);
  for (let i = 0; i < 60; i++) sim.tick();
  const moved = sim.state.nodes.some((nd, i) => Math.abs(nd.z - z0[i]) > 0.5);
  assert.ok(moved, `3D 模式下 z 应随力变化：${sim.state.nodes.map((nd, i) => (nd.z - z0[i]).toFixed(1)).join(',')}`);
});

test('3D: collision prevents overlap in three dimensions', () => {
  const sim = createSimulation([node('a'), node('b')], [], { width: 400, height: 300, dimensions: 3 });
  const [a, b] = sim.state.nodes;
  a.x = b.x = 200; a.y = b.y = 150; a.z = b.z = 0;
  for (let i = 0; i < 90; i++) sim.tick();
  assert.ok(dist3(a, b) >= a.r + b.r - 2, `3D 碰撞应防重叠，实际 ${dist3(a, b).toFixed(1)}`);
});

test('2D mode keeps z fixed at 0', () => {
  const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b', weight: 0.6 }], { width: 400, height: 300 });
  for (let i = 0; i < 60; i++) sim.tick();
  assert.ok(sim.state.nodes.every(nd => nd.z === 0));
});

test('advanceAlpha rises gradually toward drag target (no jump)', () => {
  const sim = createSimulation([node('a')], [], { width: 300, height: 300 });
  sim.state.alpha = 0; sim.state.alphaTarget = ALPHA_TARGET_DRAG;
  const a1 = advanceAlpha(sim.state);
  assert.ok(a1 > 0 && a1 < ALPHA_TARGET_DRAG, `alpha 应渐升而非跳到目标：${a1}`);
});
