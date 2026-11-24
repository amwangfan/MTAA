import type { ReactNode, ButtonHTMLAttributes, ComponentType } from "react";
import { cn } from "../utils/cn";

/* 精简共享 UI：白底细线卡片、衬线标题、少量 fade-up；无重玻璃/渐变/浮饰。 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return <div style={{ animationDelay: `${delay}ms` }} className={cn("animate-fade-up", className)}>{children}</div>;
}
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  return <span className={cn("font-display tabular-nums", className)}>{value}</span>;
}
export function GlassCard({ children, className = "", hover = false, tour }: { tour?:string; children: ReactNode; className?: string; hover?: boolean }) {
  return <div data-tour={tour} className={cn("card rounded-2xl", hover && "card-hover", className)}>{children}</div>;
}

const badgeTones: Record<string, string> = {
  whale: "bg-clay-soft text-whale-800 border-line",
  teal: "bg-moss-soft text-teal-700 border-line",
  violet: "bg-amber-soft text-amber-700 border-line",
  amber: "bg-amber-soft text-amber-700 border-line",
  rose: "bg-rose-50 text-rose-700 border-line",
  slate: "bg-paper-2 text-muted border-line",
  green: "bg-moss-soft text-teal-700 border-line",
};
export function Badge({ children, tone = "whale", className = "" }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone] || badgeTones.whale, className)}>{children}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft"; size?: "sm" | "md" };
export function Button({ type = "button", variant = "primary", size = "md", className = "", ...rest }: BtnProps) {
  const v = {
    primary: "bg-clay-deep text-white hover:bg-clay",
    soft: "bg-clay-soft text-whale-800 hover:bg-whale-100 border border-line",
    ghost: "bg-white text-ink-2 hover:bg-paper-2 border border-line",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  }[variant];
  const s = size === "sm" ? "px-3 py-1.5 text-xs min-h-8" : "px-4 py-2 text-sm";
  return <button type={type} className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed", v, s, className)} {...rest} />;
}

export function SectionHeading({ title, sub }: { title: ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-2xl md:text-3xl font-semibold text-ink">{title}</h2>
      {sub && <p className="mt-2 text-sm text-muted max-w-2xl">{sub}</p>}
    </div>
  );
}

export function WhaleLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 13c0-4 3.5-7 8-7s8 3 8 7c0 3.2-2.3 5.5-5.5 5.5H11c-3 0-5-1.8-5-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 13c-1 .3-1.6 1-1.6 2 0 1.1 1 1.7 2.1 1.2M19 9c1.6-1 3.4-.6 3.6 1 .2 1.5-1.2 2.6-2.8 2.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="11.5" r="1" fill="currentColor" />
      <path d="M14 16c1.2.6 2.8.6 4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 首字母头像：按人物配色，群主/管理员带小角标。 */
export function Avatar({ name, color, size = 36, tag, square = false }: { name: string; color: string; size?: number; tag?: string; square?: boolean }) {
  const ch = (name.replace(/^.*·\s*/, "").replace(/（.*?）/, "").trim() || "?").slice(0, 1);
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, borderRadius: square ? 10 : 9999, fontSize: size * 0.42 }} aria-hidden>
      {ch}
      {tag === "群主" && <i className="avatar-tag owner" />}
      {tag === "管理员" && <i className="avatar-tag admin" />}
    </span>
  );
}

/* 有设计的空状态：插画圆 + 标题 + 说明 + 可选动作。 */
export function EmptyState({ icon: Icon, title, sub, action }: { icon: ComponentType<{ className?: string }>; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-orb"><Icon className="h-8 w-8" /></span>
      <div className="font-display text-base font-semibold text-ink">{title}</div>
      {sub && <p className="mt-1 max-w-sm text-sm text-muted">{sub}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
