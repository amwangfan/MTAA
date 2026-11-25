import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { store, persist, notify } from "../store";

/* 只调整消息理解模式；AI 配置与密钥由服务端管理。 */
export default function AISettings({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>("select:not(:disabled), button:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", key);
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    const initial = panel.current?.querySelector<HTMLElement>("select:not(:disabled), button:not(:disabled)");
    initial?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", key);
      if (root) root.inert = wasInert;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const locked = store.busy || store.demo.running;
  return createPortal(
    <div className="ai-settings-layer">
      <button type="button" className="ai-settings-backdrop" aria-label="关闭 AI 设置" onClick={onClose} tabIndex={-1} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="ai-settings-title"
        aria-describedby="ai-mode-help ai-privacy-help" className="ai-settings-panel">
        <div className="ai-settings-head">
          <h2 id="ai-settings-title">AI 设置</h2>
          <button type="button" aria-label="关闭 AI 设置" onClick={onClose}><X size={18} /></button>
        </div>
        <label htmlFor="understanding-mode">消息理解模式</label>
        <select id="understanding-mode" aria-describedby="ai-mode-help" disabled={locked} value={store.extractMode}
          onChange={(event) => { store.extractMode = event.target.value as "ai" | "rules"; persist(); notify(); }}>
          <option value="ai">AI 整理（默认）</option>
          <option value="rules">规则整理（离线）</option>
        </select>
        <p id="ai-mode-help" className="ai-settings-note">AI 是默认整理路径。固定规则只用于离线演示或失败兜底；AI_BUSY 时会询问是否仅本次使用规则，不会开启持续回退。</p>
        <p id="ai-privacy-help" className="ai-settings-note">AI 模式仅将必要消息上下文发送到服务端；密钥不进入前端。</p>
      </div>
    </div>, document.body,
  );
}
