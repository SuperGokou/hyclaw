import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// 在庞大的 pnpm monorepo 内直接跑 electron-builder 会让其依赖收集器
// (pnpm ls)因 EMFILE 崩溃。壳零生产依赖,因此把打包输入复制到仓库外的
// 干净暂存目录,让收集器面对一个空依赖包。
const appDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appDir, "..", "..");
const staging = path.join(os.tmpdir(), "hyclaw-pack-staging");
const wantInstaller = process.argv.includes("--installer");

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
writeFileSync(
  path.join(staging, "package.json"),
  `${JSON.stringify(
    {
      name: "hyclaw",
      version: pkg.version,
      description: pkg.description,
      author: pkg.author,
      license: "MIT",
      main: "dist/main.js",
      dependencies: { "@hyclaw/hyshield": "0.1.0" },
    },
    null,
    2,
  )}\n`,
);
cpSync(path.join(appDir, "dist"), path.join(staging, "dist"), { recursive: true });
cpSync(path.join(appDir, "assets"), path.join(staging, "assets"), { recursive: true });

// 打包 @hyclaw/hyshield workspace 依赖:开发时靠符号链接,打包必须内联到
// node_modules,否则运行时 `import "@hyclaw/hyshield"` 找不到模块。
const hyshieldSrc = path.join(repoRoot, "packages", "hyshield");
const hyshieldDest = path.join(staging, "node_modules", "@hyclaw", "hyshield");
mkdirSync(hyshieldDest, { recursive: true });
cpSync(path.join(hyshieldSrc, "dist"), path.join(hyshieldDest, "dist"), { recursive: true });
writeFileSync(
  path.join(hyshieldDest, "package.json"),
  `${JSON.stringify(
    {
      name: "@hyclaw/hyshield",
      version: "0.1.0",
      type: "module",
      main: "dist/index.js",
      types: "dist/index.d.ts",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
    },
    null,
    2,
  )}\n`,
);

const builderConfig = {
  appId: "com.efd.hyclaw",
  productName: "HYClaw",
  copyright: "© 2026 EFD 和熠光显",
  electronVersion: "38.8.6",
  electronDist: path.join(repoRoot, "node_modules", "electron", "dist"),
  directories: { output: path.join(appDir, "release") },
  files: ["dist/**", "assets/**", "node_modules/**", "package.json"],
  npmRebuild: false,
  win: {
    icon: path.join(staging, "assets", "icon.ico"),
    target: ["nsis"],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    artifactName: "HYClaw-Setup-${version}.exe",
    shortcutName: "HYClaw",
  },
};
writeFileSync(
  path.join(staging, "electron-builder.json"),
  `${JSON.stringify(builderConfig, null, 2)}\n`,
);

const args = [
  "exec",
  "electron-builder",
  ...(wantInstaller ? [] : ["--dir"]),
  "--project",
  staging,
  "--config",
  path.join(staging, "electron-builder.json"),
];
const result = spawnSync("pnpm", args, { cwd: appDir, stdio: "inherit", shell: true });
rmSync(staging, { recursive: true, force: true });
process.exit(result.status ?? 1);
