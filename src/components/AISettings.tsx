import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";
import { store, persist, notify, applyChoice, loadModels } from "../store";

/* AI 设置弹层：消息理解模式 + 模型节点/模型选择（原侧栏控件收拢于此）。
   Esc 关闭、Tab 焦点圈定、关闭后焦点回到触发按钮；打开期间主区 inert。 */
export default function AISettings({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    panel.current?.querySelector<HTMLElement>("select, button")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", key);
      if (root) root.inert = wasInert;
      if (prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, [onClose]);

  const ai = store.ai;
  const lock = store.busy || store.demo.running;
  return createPortal(
    <div className="ai-settings-layer">
      <button className="ai-settings-backdrop" aria-label="关闭 AI 设置" onClick={onClose} tabIndex={-1} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" className="ai-settings-panel">
        <div className="ai-settings-head">
          <h2 id="ai-settings-title">AI 设置</h2>
          <button aria-label="关闭 AI 设置" onClick={onClose}><X size={18} /></button>
        </div>
        <label htmlFor="understanding-mode">消息理解模式</label>
        <select id="understanding-mode" disabled={lock} value={store.extractMode} onChange={(e) => { store.extractMode = e.target.value as "ai" | "rules"; persist(); notify(); }}>
          <option value="ai">AI 整理（真实模型）</option>
          <option value="rules">规则演示（离线）</option>
        </select>
        {store.extractMode === "ai" && ai.configured === false && (
          <p className="ai-settings-note">未检测到已配置的真实模型，发送消息时会自动回退规则模式并明确标注。</p>
        )}
        {store.extractMode === "ai" && ai.configured && ai.providers.length > 0 && (() => {
          const cur = ai.providers.find((p) => p.provider === ai.choice.provider) || ai.providers[0];
          return <div className="model-picker">
            <label htmlFor="ai-provider">模型节点</label>
            <select id="ai-provider" disabled={lock} value={cur.provider} onChange={(e) => applyChoice(e.target.value)}>{ai.providers.map((p) => <option key={p.provider} value={p.provider}>{p.label}</option>)}</select>
            <label htmlFor="ai-model">模型 <span className={"model-live " + (cur.live ? "is-live" : "is-off")} title={cur.live ? "列表实时拉取自节点 /models" : "节点列表暂不可用：" + (cur.error || "") + "，仅提供默认模型"}>{cur.live ? `实时 · ${cur.models.length}` : "仅默认"}</span></label>
            <div className="model-row"><select id="ai-model" disabled={lock} value={ai.choice.model} onChange={(e) => applyChoice(cur.provider, e.target.value)}>{cur.models.map((m) => <option key={m} value={m}>{m}{m === cur.default ? "（默认）" : ""}</option>)}</select>
              <button type="button" aria-label="重新拉取模型列表" title="重新拉取模型列表" disabled={lock || ai.loadingModels} onClick={() => loadModels(true)}><RefreshCw size={14} className={ai.loadingModels ? "animate-spin" : ""} /></button></div>
          </div>;
        })()}
        {store.extractMode === "ai" && ai.configured && !ai.providers.length && (
          <p className="ai-settings-note">模型列表加载中或暂不可用；发送时使用服务端默认模型。</p>
        )}
        <p className="ai-settings-note">密钥只保存在服务端环境变量，前端不接触；AI 失败或限流时自动回退本地规则引擎。</p>
      </div>
    </div>, document.body);
}
