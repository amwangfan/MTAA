# 设备（外部控制骨架 × whale 插件风险门控对应）

`lib/devices.js` 提供模拟设备注册表、风险分级、批准门控、行动账本与适配器骨架。**不声称真实设备已执行**；所有执行回执明确标注模拟。

## 注册表（模拟）

客厅灯(light)、卧室空调(ac)、窗帘(curtain)、音箱(speaker)、门锁传感器(sensor)。字段 `id/name/type/capabilities/state/online/riskTier`。能力 `on_off/set_temperature/open_close/play/get_state`。

## 风险分级（照 WhaleIO/docs/plugin-architecture.md §2）

| 能力 | 风险级 | 门控 |
|---|---|---|
| get_state | read_only | 查状态，ready |
| play | communicate | 音箱播报，AI 提议需批准 |
| on_off/set_temperature/open_close | transaction | 开关/温度/窗帘，AI 提议必须单次批准 |

手动面板操作=用户直接控制，允许（不需批准）。AI 提议的 transaction 生成 `needs_approval` 待批准卡片（批准/拒绝）；批准后 SimulatedAdapter 改状态并写行动账本：意图→批准→执行→模拟受理回执。拒绝写 denied。风险级不由意图自 declare，而由能力映射解析（防伪造提权）。

## 适配器骨架（真实接入点）

`DeviceAdapter` 接口：`discover()/getState(id)/execute(id,capability,args)`。
- `SimulatedAdapter`：进程内改 registry 状态，返回 `{simulated:true,accepted:true,...}`。
- `HomeAssistantAdapter`：空壳，方法签名+TODO，无真实网络调用。真实接入时由宿主注入 `{baseUrl,token}`，`discover`=GET /api/states、`getState`=GET /api/states/{entity_id}、`execute`=POST /api/services/{domain}/{service}；**风险门控与鉴权在宿主**，适配器只执行已批准意图。

## 产生待批准操作的来源

- 主动判断（initiative.js deviceProposal，如深夜回宿舍建议开灯）。
- 记忆对话：输入「我要开始学习了」，读取选中档案中的学习环境偏好，对比共享设备状态，仅为差异项生成待批准建议。群聊不再生成设备请求。

## 与 whale-core 的对应

能力枚举思路对应 `devices/capabilities.py`（contracts/v2 单一事实源）；行动账本对应 `devices/action_records.py` 与 gateway 的「谁触发、什么风险级、谁批准」可审计要求。Demo 未接 contracts/v2 设备总线，不修改 whale-core。

## 真实接入边界

当前 online/state 为模拟常量；无真实发现/配对/验签。真实版需 DeviceGateway 验签、registry 查表、单笔限额+日限（transaction）、失败回执不自动重试（unknown 语义）。不声称已集成。

## 记忆对话学习环境联动

三份虚构记忆档案各包含可核对的学习环境偏好（24/25/26℃等）。`lib/study-environment.js` 使用明确的开始学习意图、预置偏好和当前注册设备状态生成建议；这是规则联动，不冒充模型决策。只控制注册且在线、能力匹配的模拟设备；已符合偏好、离线、缺失或能力不足均跳过。群通知只供任务/记忆，不授予设备操作权。

对话内逐项显示设备当前状态、习惯设置、记忆依据和批准按钮；批准后共用设备对象同步设备页和账本。同一建议不重复生成；切换档案或设备已符合偏好时，过时待批准建议会被替代。审批失败记录失败，避免误显示成功。三套同题对照仍只生成回答，不产生三份设备操作。

自动演示第7步在记忆对话生成学习环境建议，第8步展示批准与模拟回执。整段8步，每步4秒，暂停时间另计。
