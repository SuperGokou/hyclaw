import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // 测试直接引用 src 的 .ts,vitest 经 esbuild 解析;dist 是给 tsc/electron 用的产物
    alias: { "@hyclaw/hyshield": new URL("./src/index.ts", import.meta.url).pathname },
  },
});
