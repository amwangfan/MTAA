import { adapterFor, initDevices, propose } from './devices.js';

function statusText(state) {
  if (!state.online) return '离线';
  if ('on' in state) return (state.on ? '已开启' : '已关闭') + ('temp' in state ? '，设定 ' + state.temp + '℃' : '');
  if ('open' in state) return state.open ? '已打开' : '已关闭';
  if ('locked' in state) return state.locked ? '已上锁' : '未上锁';
  return state.playing ? '正在播放' : '已停止';
}

export async function deviceDialog(scene, question, selectedId) {
  const devices = initDevices(scene);
  const registry = devices.registry;
  const aliases = devices.aliases ?? (registry.some(d=>d.id==='living_light') ? [{name:'light1', deviceId:'living_light', evidence:'演示设备登记'}] : []);
  const clean = value => value.trim().toLowerCase();
  const find = name => registry.find(d => [d.id, d.name].some(n => clean(n) === clean(name))) ??
    registry.find(d => aliases.some(a => a.deviceId === d.id && clean(a.name) === clean(name)));
  const q = question.trim().replace(/[。！？?!]+$/, '').trim();
  if (/^(?:(?:你|我)(?:现在)?(?:有|连接了|接入了|能控制|可以控制)?|列出|查看)?(?:多少(?:台|个)?|哪些|所有|全部)?设备(?:列表|有哪些|有多少台)?$/.test(q)) {
    return { text:`已登记 ${registry.length} 台设备，其中 ${registry.filter(d=>d.online && d.capabilities.some(c=>c!=='get_state')).length} 台在线可控制。` + registry.map(d=>d.name).join('、') };
  }
  const bind = q.match(/^(?:以后)?我说\s*(.+?)[，,]?\s*(?:就是|指的是)\s*(.+)$/);
  const rename = q.match(/^(?:以后)?(.+?)改叫\s*([^，,]+)(?:[，,].*)?$/);
  if (bind || rename) {
    const target = find(bind ? bind[2] : rename[1]);
    const name = (bind ? bind[1] : rename[2]).trim();
    if (!target) return { text:'没有找到要命名的设备，请使用设备清单里的名称。' };
    const occupied = find(name);
    if (occupied && occupied.id !== target.id) return { text:'这个名称已经属于' + occupied.name + '。' };
    devices.aliases = aliases.filter(a => a.deviceId !== target.id || (!rename && clean(a.name) !== clean(name)));
    devices.aliases.push({ name, deviceId:target.id, evidence:question, at:scene.now });
    return { text:'已记住，' + name + ' 指的是' + target.name + '。' };
  }
  const command = q.match(/^(?:请)?(?:帮我|给我)?\s*(打开|开启|关闭|关掉|拉开|拉上|播放|停止播放)\s*(.+)$/);
  const query = q.match(/^(.+?)(?:现在)?(?:是什么(?:设备)?|开着吗|打开了吗|状态如何|什么状态)$/);
  if (!command && !query) return null;
  const name = (command?.[2] ?? query[1]).trim();
  const target = selectedId ? registry.find(d=>d.id===selectedId) : find(name);
  if (!target && query && !/设备|灯|空调|窗帘|音箱|传感器|light\d+/i.test(name + query[0].slice(name.length))) return null;
  if (!target) return {text:'还不知道「' + name + '」指哪台设备。请选择本次要使用的设备。', choices:registry.map(d=>({id:d.id,name:d.name}))};
  const live = await adapterFor(scene).getState(target.id);
  if (query) return {text:name + ' 对应' + target.name + '，当前' + statusText(live) + '。'};
  const on = ['打开','开启','拉开','播放'].includes(command[1]);
  const capability = target.capabilities.find(c => ['on_off','open_close','play'].includes(c));
  if (!live.online || !capability) return {text:target.name + (live.online ? '只支持查看状态。' : '已离线。')};
  if ((/播放/.test(command[1]) && capability !== 'play') || (/^拉/.test(command[1]) && capability !== 'open_close')) return {text:target.name + '不支持这个动作。'};
  const args = capability === 'open_close' ? {open:on} : capability === 'play' ? {playing:on} : {on};
  const entry = propose(scene,{deviceId:target.id,capability,args,source:'owner',reason:question});
  return {text:'请确认' + command[1] + target.name + '。', entryId:entry.id};
}
