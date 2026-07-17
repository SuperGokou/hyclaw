export interface FenceResult {
  ok: boolean;
  reason?: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const EXPOSED_REASON =
  "HYShield 拒绝启动:网关绑定配置会把服务暴露到本机以外。请将 gateway.bind 设为 " +
  '"loopback"(仅本机访问);手机互联请用 HYClaw 的扫码配对功能,而非放开绑定。';

export function assertLoopbackBind(config: {
  gateway?: { bind?: string; customBindHost?: string };
}): FenceResult {
  const bind = config.gateway?.bind;
  if (!bind || bind === "loopback") return { ok: true };
  if (bind === "custom") {
    const host = config.gateway?.customBindHost ?? "";
    if (LOOPBACK_HOSTS.has(host)) return { ok: true };
    return { ok: false, reason: `${EXPOSED_REASON}(当前 customBindHost=${host || "未设置"})` };
  }
  return { ok: false, reason: `${EXPOSED_REASON}(当前 gateway.bind=${bind})` };
}
