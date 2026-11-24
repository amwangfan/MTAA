# Whale · 消息有着落

**2026 Qoder 高校创造力大赛参赛作品**（主投 StudyHack 学习科研，同时适配 LifeHack 生活娱乐）

Whale 是给被群消息淹没的大学生用的 AI 信息管家。它把课程、社团、项目、实验室、宿舍五个群的通知整理成**带原文证据的待办建议**，记住你的习惯，在合适的时候克制地提醒你，并在你批准后联动宿舍设备。

Whale 核心项目的近期群记忆开发成果与本 Demo 的对接状态见[开发进展统计](docs/whale-development-update.md)。

## 评委 5 步体验

1. 打开站点，点击「**一键自动演示 · 32 秒**」，看完整流程：通知 → 建议 → 确认 → 溯源 → 提醒 → 设备。
2. 进入「消息来源」，选一个群，点一条示例消息或自己输入一条（以群主或管理员身份），然后发送。
3. 回到「信息总结」，点开建议，查看原文高亮和证据连线，再决定添加还是删除。
4. 进入「记忆」，用同一个问题对照三套记忆档案，点 M 编号核对每句话的依据。
5. 在「主动判断」里快进时钟看提醒；在「记忆」说「我要开始学习了」，核对学习偏好、设备状态并批准调整。

自动演示共 8 步，每步 4 秒，其中 1.5 秒用于转场，总计约 32 秒。当前内容由固定阴影突出，停止按钮下方可暂停或继续演示。

侧栏可以切换**学习 / 生活 / 全部**三个场景，也可以一键重置演示数据。「关于作品」页说明了作品是什么、为什么做、怎么用以及技术架构。

## 运行

```
npm install
npm run verify     # 类型检查 + 测试 + 构建（产出单文件 dist/index.html）
npm start          # http://127.0.0.1:18762
```

Windows 用户可以双击 `start-demo.cmd`，日志写到 `logs/`。配置本机密钥请双击 `configure-ai.cmd`，输入时隐藏显示，密钥只写入被 Git 忽略的 `.env`。

「记忆」页的群记忆空间沿用 MTAA 的暖纸色界面：可手动整合虚构项目群消息，切换可旋转的 2D／3D 图谱，按成员、关键词和节点类型查找，并沿记忆节点查看发送者、时间、原话及更正／撤销链。下方可按对话段或成员浏览，重复整合不会重复写入。该区域只使用虚构演示消息，不读取真实 QQ 聊天；真实群记忆仍由 whale-core 保存。

## 真实 AI 与回退

- 默认使用「AI 整理（真实模型）」。浏览器把请求发给服务端 `/api/v1/*`，服务端默认用 `AGENTSCOPE_API_KEY` 调用 AgentScope 节点（SSE 流式，默认 `qwen3.8-flash`），也可配置 `DEEPSEEK_API_KEY` 作为备选；侧栏可切换节点，可选模型实时从节点 `/models` 拉取。**密钥不会出现在前端。**
- 模型输出必须通过契约校验才会显示，并标注「AI提取」。校验规则：原文引用必须逐字匹配，ID 不能虚构，地点必须出现在引用里。
- 没有配置密钥、被限流或模型失败时，前端**自动回退到规则引擎**，并标注「规则回退 / 规则引擎」，演示不会中断，也不会冒充 AI 结果。
- 公网保护：只接受同源请求（跨域需配置 `ALLOWED_ORIGINS`）、按 IP 滑动窗口限流、设全站每日总额度。详见 `.env.example`。

## 部署

- **Qoder Sites（比赛要求）**：见 [deploy/qoder-sites.md](deploy/qoder-sites.md)。入口是 `sites/api.mjs`，提供 Web 标准的 fetch 处理器。
- **自托管 Node**：见 [deploy/deploy.md](deploy/deploy.md)（systemd + nginx）。

## 目录

```
src/            React 19 + Vite 7 + Tailwind 4 界面
  sim.ts        群聊拟真层（虚构人物、群公告、附件/接龙/图片占位、引用回复，仅用于展示）
  demo.ts       一键自动演示脚本
  api.ts        API 地址（可通过 VITE_API_BASE 配置）
lib/            纯逻辑：规则引擎、记忆、主动判断、设备门控、契约校验（浏览器与 Node 共用）
backend/        handler.mjs（与运行时无关）、rate-limit.mjs、各 AI 端点的提示词与校验
sites/api.mjs   Qoder Sites / Serverless 入口
server.mjs      本地 / 自托管 Node 入口
tests/          node --test
docs/           设计文档与论坛帖草稿（forum-post.md）
```

## 边界说明

- 群聊人物和消息都是虚构的，没有接入真实 QQ。
- 设备是模拟受理，已预留 `HomeAssistantAdapter` 接口。
- 数据只保存在浏览器的 localStorage 里，公网上每个访客的数据互相隔离。
- 演示时钟从 2026-11-20 09:00（北京时间）开始。

## 验证

`npm test` 运行业务流程测试（workflow）、记忆对话测试（memory-chat）和 API 测试（api：配置状态、503 回退、来源校验、限流）。`npm run typecheck` 做类型检查，`npm run build` 生成单文件。
