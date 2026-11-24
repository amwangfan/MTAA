import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, step, ALPHA_MIN } from '../lib/graph-layout.js';

const node = (id, kind = 'member') => ({ id, kind, label: id });

test('repulsion separates overlapping nodes', () => {
  const sim = createSimulation([node('a'), node('b')], [], { width: 400, height: 300 });
  const [a, b] = sim.state.nodes;
  a.x = b.x = 200; a.y = b.y = 150;
  for (let i = 0; i < 60; i++) sim.tick();
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(dist > 40, `斥力应把重叠节点分开，实际 ${dist.toFixed(1)}`);
});

test('higher weight link pulls closer than low weight', () => {
  const settle = weight => {
    const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b', weight }], { width: 960, height: 450 });
    const [a, b] = sim.state.nodes;
    a.x = 370; b.x = 590; a.y = b.y = 225;
    sim.state.alpha = 1; sim.state.alphaTarget = 1;
    for (let i = 0; i < 500; i++) sim.tick();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const high = settle(1.0); const low = settle(0.2);
  assert.ok(high < low - 80, `高权重应更近：high=${high.toFixed(1)} low=${low.toFixed(1)}`);
});

test('default link weight is 0.6 (backward compatible)', () => {
  const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b' }], { width: 960, height: 450 });
  assert.equal(sim.state.links[0].weight, 0.6);
});

test('fx/fy locked node stays fixed while neighbour moves', () => {
  const sim = createSimulation([node('a'), node('b'), node('c')],
    [{ id: 'ab', from: 'a', to: 'b', weight: 0.6 }, { id: 'ac', from: 'a', to: 'c', weight: 0.6 }],
    { width: 600, height: 400 });
  const [a, b] = sim.state.nodes;
  sim.setDrag('a', 100, 100);
  const before = { x: b.x, y: b.y };
  for (let i = 0; i < 40; i++) sim.tick();
  assert.equal(a.x, 100); assert.equal(a.y, 100);
  const moved = Math.hypot(b.x - before.x, b.y - before.y);
  assert.ok(moved > 1, `邻居应因斥力/碰撞移动，实际 ${moved.toFixed(2)}`);
  sim.endDrag('a');
  assert.equal(a.fx, null); assert.equal(a.fy, null);
});

test('alpha decays toward alphaMin and stops', () => {
  const sim = createSimulation([node('a')], [], { width: 300, height: 300 });
  let previous = sim.alpha; let stopped = false;
  for (let i = 0; i < 3000; i++) {
    const alpha = sim.tick();
    assert.ok(alpha <= previous + 1e-9, 'alpha 应单调不增');
    previous = alpha;
    if (alpha <= ALPHA_MIN + 1e-12) { stopped = true; break; }
  }
  assert.ok(stopped, `alpha 应收敛到 alphaMin，实际 ${sim.alpha}`);
  assert.ok(sim.alpha <= ALPHA_MIN, `停止后 alpha 应为 0 或极小，实际 ${sim.alpha}`);
});

test('collision prevents overlap even at alpha 0', () => {
  const sim = createSimulation([node('a'), node('b')], [], { width: 400, height: 300 });
  const [a, b] = sim.state.nodes;
  a.x = b.x = 200; a.y = b.y = 150;
  sim.state.alpha = 0; sim.state.alphaTarget = 0;
  for (let i = 0; i < 20; i++) step(sim.state);
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(dist >= a.r + b.r - 1, `碰撞后距离应不小于半径和，实际 ${dist.toFixed(1)}`);
});

test('drag reheats then settles after release', () => {
  const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b', weight: 0.6 }], { width: 600, height: 400 });
  for (let i = 0; i < 500; i++) sim.tick();
  assert.ok(sim.alpha < 0.05, `静置后 alpha 应很低，实际 ${sim.alpha}`);
  const [a, b] = sim.state.nodes;
  const before = b.x;
  sim.setDrag('a', 120, 120);
  assert.ok(sim.alpha >= 0.29, `拖拽应 reheat 到约 0.3，实际 ${sim.alpha}`);
  for (let i = 0; i < 12; i++) sim.tick();
  assert.equal(a.x, 120); assert.equal(a.y, 120);
  assert.ok(Math.abs(b.x - before) > 0.5, '拖拽时邻居应动态退避');
  sim.endDrag('a');
  for (let i = 0; i < 500; i++) sim.tick();
  assert.ok(sim.alpha < 0.05, `松手后应 settle，实际 ${sim.alpha}`);
});
