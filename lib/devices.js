// 外部控制骨架（理想化模拟）。风险分级照 whale 插件门控：read_only / communicate / transaction。
// 真实接入点：DeviceAdapter 接口 + HomeAssistantAdapter 空壳（见 docs/devices.md）。不声称真实设备已执行。
export const RISK = { get_state: 'read_only', play: 'communicate', on_off: 'transaction', set_temperature: 'transaction', open_close: 'transaction' };
export const defaultRegistry = () => [
  { id: 'living_light', name: '客厅灯', type: 'light', capabilities: ['on_off', 'get_state'], state: { on: false }, online: true, riskTier: 'transaction' },
  { id: 'bedroom_ac', name: '卧室空调', type: 'ac', capabilities: ['on_off', 'set_temperature', 'get_state'], state: { on: false, temp: 26 }, online: true, riskTier: 'transaction' },
  { id: 'curtain', name: '窗帘', type: 'curtain', capabilities: ['open_close', 'get_state'], state: { open: false }, online: true, riskTier: 'transaction' },
  { id: 'speaker', name: '音箱', type: 'speaker', capabilities: ['play', 'get_state'], state: { playing: false }, online: true, riskTier: 'communicate' },
  { id: 'door_sensor', name: '门锁传感器', type: 'sensor', capabilities: ['get_state'], state: { locked: true }, online: true, riskTier: 'read_only' }
];
export const riskFor = cap => RISK[cap] || 'transaction';

// DeviceAdapter 接口：discover / getState / execute。真实实现替换此处。
export class SimulatedAdapter {
  constructor(registry) { this.registry = registry; }
  async discover() { return this.registry.map(d => ({ id: d.id, name: d.name, capabilities: d.capabilities })); }
  async getState(id) { const d = this.registry.find(x => x.id === id); if (!d) throw new Error('设备不存在'); return { ...d.state, online: d.online }; }
  async execute(id, cap, args = {}) {
    const d = this.registry.find(x => x.id === id);
    if (!d) throw new Error('设备不存在');
    if (!d.online) throw new Error('设备离线');
    if (!d.capabilities.includes(cap)) throw new Error('设备不支持该能力');
    if (cap === 'on_off') d.state.on = Boolean(args.on);
    else if (cap === 'set_temperature') d.state.temp = Number(args.temp);
    else if (cap === 'open_close') d.state.open = Boolean(args.open);
    else if (cap === 'play') d.state.playing = Boolean(args.playing ?? (args.play !== false));
    return { simulated: true, accepted: true, at: Date.now(), state: { ...d.state } };
  }
}
// 真实接入空壳：方法签名 + TODO，无真实网络调用。配置说明见 docs/devices.md。
export class HomeAssistantAdapter {
  constructor(config = {}) { this.config = config; /* TODO: {baseUrl, token} 由宿主注入 */ }
  async discover() { /* TODO: GET /api/states 过滤 domain */ throw new Error('HomeAssistantAdapter 未实现：真实接入点'); }
  async getState(id) { /* TODO: GET /api/states/{entity_id} */ throw new Error('HomeAssistantAdapter 未实现：真实接入点'); }
  async execute(id, cap, args) { /* TODO: POST /api/services/{domain}/{service}，风险门控在宿主 */ throw new Error('HomeAssistantAdapter 未实现：真实接入点'); }
}

export function initDevices(state) {
  if (!state.devices) state.devices = { registry: defaultRegistry(), pending: [], ledger: [] };
  return state.devices;
}
// 设备是宿舍共享的一套，可能被多个群的状态引用；动作ID用设备自身计数，避免跨群冲突。
export function nextActionId(state) {
  const dev = initDevices(state);
  if (!Number.isInteger(dev.seq)) dev.seq = Math.max(0, ...[...dev.pending, ...dev.ledger].map(x => Number(String(x.id || '').replace(/^\D+/, '')) || 0));
  dev.seq += 1;
  return 'da' + dev.seq;
}
export function adapterFor(state) { return new SimulatedAdapter(initDevices(state).registry); }

export function propose(state, { deviceId, capability, args = {}, source = 'initiative', reason = '', evidence = [] }) {
  const dev = initDevices(state);
  const d = dev.registry.find(x => x.id === deviceId);
  if (!d || !d.capabilities.includes(capability)) return null;
  const tier = riskFor(capability);
  const entry = { id: nextActionId(state), deviceId, capability, args, source, reason, evidence, riskTier: tier, status: tier === 'read_only' ? 'ready' : 'needs_approval', at: state.now };
  dev.pending.push(entry);
  dev.ledger.push({ id: entry.id, at: state.now, stage: 'intent', source, deviceId, capability, riskTier: tier, reason });
  return entry;
}
export async function manualControl(state, deviceId, capability, args = {}) {
  const dev = initDevices(state);
  const receipt = await adapterFor(state).execute(deviceId, capability, args);
  dev.ledger.push({ id: nextActionId(state), at: state.now, stage: 'executed', source: 'manual', deviceId, capability, riskTier: riskFor(capability), receipt });
  return receipt;
}
export async function approve(state, id) {
  const dev = initDevices(state);
  const e = dev.pending.find(x => x.id === id);
  if (!e || e.status !== 'needs_approval') return null;
  e.status = 'approved';
  dev.ledger.push({ id: e.id, at: state.now, stage: 'approved', source: e.source, deviceId: e.deviceId, capability: e.capability, riskTier: e.riskTier });
  let receipt;
  try {receipt = await adapterFor(state).execute(e.deviceId, e.capability, e.args);}
  catch(error){e.status='failed';dev.ledger.push({id:e.id,at:state.now,stage:'failed',source:e.source,deviceId:e.deviceId,capability:e.capability});throw error;}
  e.status = 'executed'; e.receipt = receipt;
  dev.ledger.push({ id: e.id, at: state.now, stage: 'executed', source: e.source, deviceId: e.deviceId, capability: e.capability, riskTier: e.riskTier, receipt });
  return e;
}
export function reject(state, id) {
  const dev = initDevices(state);
  const e = dev.pending.find(x => x.id === id);
  if (!e || e.status !== 'needs_approval') return null;
  e.status = 'rejected';
  dev.ledger.push({ id: e.id, at: state.now, stage: 'denied', source: e.source, deviceId: e.deviceId, capability: e.capability, riskTier: e.riskTier });
  return e;
}

// 聊天指令 → 设备提议（如「回宿舍把客厅灯打开」）。
export function detectCommand(text) {
  const t = String(text || '');
  const on = /打开|开灯|开启|拉开|播放/.test(t), off = /关闭|关掉|关灯|拉上/.test(t);
  if (/客厅灯|回宿舍.*灯/.test(t)) return { deviceId: 'living_light', capability: 'on_off', args: { on: !off } };
  if (/空调/.test(t)) { const m = t.match(/(\d{1,2})\s*度/); if (m) return { deviceId: 'bedroom_ac', capability: 'set_temperature', args: { temp: Number(m[1]) } }; return { deviceId: 'bedroom_ac', capability: 'on_off', args: { on: !off } }; }
  if (/窗帘/.test(t)) return { deviceId: 'curtain', capability: 'open_close', args: { open: on && !off } };
  if (/音箱/.test(t)) return { deviceId: 'speaker', capability: 'play', args: { play: on } };
  return null;
}
