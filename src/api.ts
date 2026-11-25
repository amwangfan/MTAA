// 前端 API 地址：默认同源 Qoder Sites Function；可用 VITE_API_BASE 或 window.WHALE_API_BASE 覆盖。
// 只放地址，绝不放密钥；模型由服务端 AI_MODEL 决定。
const raw = String(((import.meta as any).env?.VITE_API_BASE) || (typeof window !== "undefined" && (window as any).WHALE_API_BASE) || "/functions/v1/app");
export const API_BASE = raw.replace(/\/+$/, "");
export const apiUrl = (p: string) => (p.startsWith("/") ? API_BASE + p : p);

export const apiFetch: typeof fetch = ((input: any, init?: RequestInit) => {
  const url = typeof input === "string" ? apiUrl(input) : input;
  return fetch(url, { ...init, credentials: "same-origin" });
}) as typeof fetch;
