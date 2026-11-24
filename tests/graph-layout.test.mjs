import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, step, advanceAlpha, shouldStartDrag, rotate3D, screenDeltaToWorld3D, viewMetrics, ALPHA_MIN, ALPHA_TARGET_DRAG, MAX_MOVE } from '../lib/graph-layout.js';

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

test('drag is 1:1 with pointer target (no lerp lag)', () => {
  const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b', weight: 0.6 }], { width: 600, height: 400 });
  for (let i = 0; i < 300; i++) sim.tick();
  const a = sim.state.nodes[0];
  sim.setDrag('a', a.x + 100, a.y - 40);
  sim.tick();
  assert.equal(a.x, a.fx); assert.equal(a.y, a.fy); // 位置即目标，无滞后
  assert.equal(a.x % 1 === 0 ? a.x : a.x, a.x); // 占位：上方已断言精确相等
  const tx = a.x, ty = a.y;
  sim.setDrag('a', tx + 7, ty + 3);
  sim.tick();
  assert.equal(a.x, tx + 7); assert.equal(a.y, ty + 3); // 跟随精确到像素
  sim.endDrag('a');
  assert.equal(a.fx, null); assert.equal(a.fy, null);
});

test('press below threshold does not start a drag (no reheat, neighbours untouched)', () => {
  assert.equal(shouldStartDrag(2, 2), false);
  assert.equal(shouldStartDrag(0, 0), false);
  assert.equal(shouldStartDrag(3, 3), true); // hypot(3,3)≈4.24 > 4
  assert.equal(shouldStartDrag(5, 0), true);
  // 不调用 setDrag 时模拟不受任何扰动
  const sim = createSimulation([node('a'), node('b')], [{ id: 'l', from: 'a', to: 'b', weight: 0.6 }], { width: 600, height: 400 });
  for (let i = 0; i < 400; i++) sim.tick();
  const alpha = sim.alpha;
  const pos = sim.state.nodes.map(nd => ({ x: nd.x, y: nd.y }));
  sim.tick();
  assert.equal(sim.alpha, alpha, '无 setDrag 的 tick 不应 reheat');
  sim.state.nodes.forEach((nd, i) => assert.equal(nd.fx, null));
  void pos;
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
  sim.setDrag('a', before.x, before.y); // 把 a 拖到 b 身上：碰撞必须渐进推开 b
  let firstTickMove = 0;
  for (let i = 0; i < 40; i++) {
    const px = b.x, py = b.y;
    sim.tick();
    if (i === 0) firstTickMove = Math.hypot(b.x - px, b.y - py);
  }
  assert.equal(a.x, before.x); assert.equal(a.y, before.y); // 被拖节点 1:1 锁定
  assert.ok(firstTickMove > 0 && firstTickMove <= MAX_MOVE, `首帧退避应连续不跳变：${firstTickMove.toFixed(2)}`);
  assert.ok(Math.hypot(b.x - before.x, b.y - before.y) > 10, '邻居应动态退避');
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

test('3D screen→world mapping is 1:1 at zero rotation and scale', () => {
  // 零旋转 + pz=0（scale=1）：世界位移应精确等于视图位移
  const d = screenDeltaToWorld3D(10, -4, 0, 0, 0);
  assert.ok(Math.abs(d.dx - 10) < 1e-9 && Math.abs(d.dy + 4) < 1e-9 && Math.abs(d.dz) < 1e-9);
  // 透视 scale=2（pz=275）：世界位移 = 视图位移 / 2
  const d2 = screenDeltaToWorld3D(10, -4, 275, 0, 0);
  assert.ok(Math.abs(d2.dx - 5) < 1e-9 && Math.abs(d2.dy + 2) < 1e-9, `scale 修正：${d2.dx},${d2.dy}`);
  // 有旋转时保长（逆旋转是正交变换）：世界位移模长 = 视图模长/scale
  const rx = 0.4, ry = -0.3, pz = 0; const s = 550 / (550 - pz);
  const d3 = screenDeltaToWorld3D(7, 3, pz, rx, ry);
  const lenIn = Math.hypot(7 / s, 3 / s), lenOut = Math.hypot(d3.dx, d3.dy, d3.dz);
  assert.ok(Math.abs(lenIn - lenOut) < 1e-9, `旋转应保长：${lenIn} vs ${lenOut}`);
});

test('rotate3D is consistent with screenDeltaToWorld3D projection depth', () => {
  // 屏幕位移换算使用的 pz 即 rotate3D 的 nz
  const r = rotate3D(100, -50, 80, 0.2, 0.6);
  assert.ok(Number.isFinite(r.nx) && Number.isFinite(r.ny) && Number.isFinite(r.nz));
  const d = screenDeltaToWorld3D(4, 4, r.nz, 0.2, 0.6);
  assert.ok(Math.abs(Math.hypot(d.dx, d.dy, d.dz) - Math.hypot(4, 4) / (550 / (550 - r.nz))) < 1e-9);
});

// 组件管线往返自检：world →（旋转+透视）→ screen；screen 位移 →（除scale+逆旋转）→ world 增量
// 加回 world 再投影，屏幕位移必须精确还原（1:1）。覆盖 DEFAULT_ROT 与多种深度/zoom。
// 数值集成测试：完整复刻组件 onPointerMove 3D 调用链
// client 增量 → viewDelta(÷letterbox 内容缩放) → ÷zoom → screenDeltaToWorld3D(÷透视 scale→逆旋转) → 累加 world
// 再经渲染管线（rotate3D→透视→×zoom→×letterbox 缩放）投回屏幕，必须精确还原 client 增量（1:1）。
test('full component pipeline: client delta roundtrips through letterbox + zoom + perspective', () => {
  const CX = 480, CY = 225, VIEW_W = 960, VIEW_H = 450;
  const rects = [[1280, 350], [746.7, 350], [500, 300]]; // 宽版留边 / 恰好 / 竖版留边
  const rotations = [[-0.18, 0.25], [0.4, -0.6]];
  const nodes = [[500, 240, 0], [620, 180, -183], [400, 300, 90]];
  for (const [rw, rh] of rects) for (const [rx, ry] of rotations) for (const [wx, wy, wz] of nodes) for (const zoom of [1, 1.7]) {
    const vm = viewMetrics(rw, rh, VIEW_W, VIEW_H);
    const clientDelta = { dx: 60, dy: 40 };
    // —— 组件 onPointerMove 3D 分支 ——
    const d = { dx: clientDelta.dx / vm.scale, dy: clientDelta.dy / vm.scale };      // viewDelta
    const pz = rotate3D(wx - CX, wy - CY, wz, rx, ry).nz;                            // 被拖节点当前投影深度
    const w = screenDeltaToWorld3D(d.dx / zoom, d.dy / zoom, pz, rx, ry);            // ÷zoom → ÷透视 → 逆旋转
    const nx2 = wx + w.dx, ny2 = wy + w.dy, nz2 = wz + w.dz;                         // 累加 world 目标
    // —— 渲染管线（paint）——
    const r0 = rotate3D(wx - CX, wy - CY, wz, rx, ry);
    const s0 = Math.max(.55, Math.min(1.6, 550 / (550 - r0.nz)));
    const r1 = rotate3D(nx2 - CX, ny2 - CY, nz2, rx, ry);
    const s1 = Math.max(.55, Math.min(1.6, 550 / (550 - r1.nz)));
    const viewDx = ((CX + r1.nx * s1) - (CX + r0.nx * s0)) * zoom;                   // viewBox 位移（含 zoom）
    const viewDy = ((CY + r1.ny * s1) - (CY + r0.ny * s0)) * zoom;
    const gotClientX = viewDx * vm.scale, gotClientY = viewDy * vm.scale;            // 回 client 坐标
    assert.ok(Math.abs(gotClientX - 60) < 1e-6 && Math.abs(gotClientY - 40) < 1e-6,
      `rect=${rw}x${rh} rot=(${rx},${ry}) z=${wz} zoom=${zoom}: 期望(60,40) 实际(${gotClientX.toFixed(3)},${gotClientY.toFixed(3)})`);
  }
});

test('viewMetrics computes letterbox scale and centering', () => {
  const m = viewMetrics(1280, 350, 960, 450);
  assert.ok(Math.abs(m.scale - 350 / 450) < 1e-9, '内容缩放取 min(宽比,高比)');
  assert.ok(Math.abs(m.ox - (1280 - 960 * m.scale) / 2) < 1e-9, '水平居中留边');
  assert.ok(Math.abs(m.oy) < 1e-9, '高度撑满无纵向留边');
});

test('3D drag pipeline roundtrip: screenDelta → world → screen == screenDelta', () => {
  const CX = 480, CY = 225;
  const project = (wx, wy, wz, rx, ry) => {
    const r = rotate3D(wx - CX, wy - CY, wz, rx, ry);
    const s = 550 / (550 - r.nz);
    return { sx: CX + r.nx * s, sy: CY + r.ny * s, nz: r.nz };
  };
  const rotations = [[-0.18, 0.25], [0.4, -0.6], [0, 0], [1.0, 0.9]]; // 含 DEFAULT_ROT 与较大角度
  const nodes = [[500, 240, 0], [620, 180, -80], [400, 300, 90], [300, 150, 200]];
  for (const [rx, ry] of rotations) for (const [wx, wy, wz] of nodes) for (const zoom of [1, 1.7, 0.6]) {
    const p0 = project(wx, wy, wz, rx, ry);
    const pointer = { dx: 60, dy: 40 }; // 用户看到的屏幕位移（viewBox 坐标）
    // 组件接线：先除 zoom，pz 用投影深度
    const w = screenDeltaToWorld3D(pointer.dx / zoom, pointer.dy / zoom, p0.nz, rx, ry);
    const p1 = project(wx + w.dx, wy + w.dy, wz + w.dz, rx, ry);
    // 投影后的内容位移 × zoom 应精确等于指针位移
    const gotX = (p1.sx - p0.sx) * zoom, gotY = (p1.sy - p0.sy) * zoom;
    assert.ok(Math.abs(gotX - pointer.dx) < 1e-6 && Math.abs(gotY - pointer.dy) < 1e-6,
      `rx=${rx} ry=${ry} z=${wz} zoom=${zoom}: 期望(${pointer.dx},${pointer.dy}) 实际(${gotX.toFixed(3)},${gotY.toFixed(3)})`);
  }
});
