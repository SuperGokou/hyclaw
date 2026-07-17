<div align="center">

<img src="branding/generated/icon-256.png" alt="HYClaw Logo" width="120" height="120" />

# HYClaw · 和熠智脑

**EFD 和熠光显 · 企业级本地优先 AI 工作台**

_企业级 · 本地优先 · 安全可控的 AI 员工工作台_

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D6?style=for-the-badge&logo=windows11&logoColor=white" alt="Platforms">
  <img src="https://img.shields.io/badge/Node-%E2%89%A522.22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/pnpm-11.2-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm">
</p>
<p>
  <img src="https://img.shields.io/badge/Electron-38-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87%E4%BC%98%E5%85%88%20%2F%20English-c8281e?style=for-the-badge" alt="Bilingual">
</p>
<p>
  <img src="https://img.shields.io/badge/V1%20%E8%BF%9B%E5%BA%A6-M1%20%E5%AE%8C%E6%88%90-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/%E5%AE%89%E5%85%A8-HYShield-2ea44f?style=for-the-badge&logo=springsecurity&logoColor=white" alt="HYShield">
</p>

[设计文档](docs/superpowers/specs/2026-07-16-hyclaw-v1-design.md) ·
[验收标准](docs/superpowers/specs/2026-07-16-hyclaw-v1-acceptance.md) ·
[实施计划](docs/superpowers/plans/2026-07-16-m1-fork-brand-electron-shell.md)

</div>

---

## 简介 | Introduction

**HYClaw(和熠智脑)** 由 **EFD 和熠光显** 打造,基于成熟的开源 AI 网关引擎(MIT 协议)深度定制。它把强大的个人 AI 助手网关改造成一个**可安装、可管控、数据不出本机**的企业员工工作台:

> **HYClaw** is an enterprise AI workbench by EFD, built on a mature open-source AI gateway engine (MIT). Installable, security-fenced, local-first — with Office document skills, data visualization, Chinese-first bilingual UI, and a hardened security layer (HYShield).

三大差异化支柱:

| 支柱                     | 说明                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 🛡️ **HYShield 安全围栏** | 针对上游公开安全问题逐条设防:仅回环绑定、强制令牌、密钥加密落盘、skill 白名单、出站域名白名单、IM 注入防护 |
| 📊 **Office + 可视化**   | Word / Excel / PowerPoint / PDF 读写改汇总,ECharts 图表面板,报告一键生成                                   |
| 🌏 **中文优先双语**      | zh-CN 默认、en-US 一键切换,中文问答专项调优                                                                |

## 功能特性 | Features

- 🖥️ **桌面应用**:Electron 壳,Windows / macOS / Linux 三平台,NSIS 安装向导可自选路径(QClaw 同款形态)
- 🤖 **多模型接入**:Anthropic API / OpenAI 兼容端点(DeepSeek、通义、Kimi、内网私有模型)/ Ollama 本地模型
- 📄 **Office 文档**:docx / xlsx / pptx / pdf 四件套 skills,工作区路径围栏
- 📈 **数据可视化**:Agent 分析数据 → ECharts 实时渲染 → 导出 PNG / 嵌入报告
- 💬 **企业 IM 渠道**:企业微信、钉钉(官方 API);飞书 V1.5;个人微信实验性(默认关闭)
- 🔌 **通用 MCP**:ERP / 数据库 / OA 等企业系统统一接入口
- 🐾 **HYPet 桌面伴侣**:悬浮桌宠、语音+文字主动提示、前台应用感知
- 🏢 **智能体空间**:基于 Claw3D 的 3D 虚拟办公室,多 Agent 活动可视化
- 📱 **手机互联**:IM 即手机端(零配置)+ 局域网扫码配对

## 总体架构 | Architecture

```mermaid
flowchart TB
    subgraph Desktop["🖥️ HYClaw Desktop(Electron 壳)"]
        UI["品牌化控制台 UI<br/>(上游 Lit UI + 品牌/i18n/可视化增量层)"]
        SPACE["🏢 智能体空间<br/>(Claw3D 3D 页签)"]
        PET["🐾 HYPet 桌面伴侣<br/>(语音/文字提示)"]
        MAIN["主进程<br/>Gateway 子进程管理 · 托盘 · 单实例"]
    end

    subgraph Gateway["⚙️ HYClaw Gateway(核心引擎,状态目录 ~/.hyclaw)"]
        AGENT["Agent 运行时"]
        SKILLS["Skills<br/>📄 Office · 📈 可视化 · 📧 邮件"]
        CHANNELS["渠道层<br/>企业微信 · 钉钉 · 飞书 · MCP"]
        MODELS["模型层<br/>Anthropic · OpenAI 兼容 · Ollama"]
    end

    subgraph Shield["🛡️ HYShield 安全围栏(横切层)"]
        NET["网络围栏<br/>仅 127.0.0.1"]
        VAULT["凭证加密<br/>DPAPI/Keychain"]
        ALLOW["Skill 白名单<br/>+哈希校验"]
        EGRESS["出站域名白名单<br/>+审计日志"]
    end

    MAIN -- "localhost WebSocket<br/>(仅回环+令牌)" --> Gateway
    UI --> MAIN
    SPACE --> MAIN
    PET --> MAIN
    AGENT --> SKILLS
    AGENT --> MODELS
    CHANNELS --> AGENT
    Shield -.管控.- Gateway
    MODELS -- "唯一出站流量" --> EXT["☁️ 模型 API(白名单域名)"]

    PHONE["📱 手机<br/>(IM @机器人 / 扫码配对)"] --> CHANNELS

    style Shield fill:#2ea44f22,stroke:#2ea44f
    style Desktop fill:#c8281e11,stroke:#c8281e
```

### 启动流程 | Startup Sequence

```mermaid
sequenceDiagram
    participant U as 👤 用户
    participant E as Electron 主进程
    participant W as 品牌窗口
    participant G as Gateway 子进程
    participant C as 控制台 UI

    U->>E: 双击 HYClaw
    E->>E: 单实例锁检查
    E->>W: 打开品牌加载页(EFD logo)
    E->>E: 引导配置(~/.hyclaw 隔离状态目录)
    E->>G: 拉起网关子进程(spawn)
    loop 就绪探测(≤120s)
        E->>G: HTTP 探测 127.0.0.1:18789
    end
    G-->>E: HTTP 200
    E->>W: loadURL(控制台)
    W->>C: 渲染 HYClaw 控制台
    U->>C: 开始对话 💬
    Note over G: 崩溃自动重启(≤3次)<br/>超限显示故障页
```

## 路线图 | Roadmap

```mermaid
flowchart LR
    subgraph V1["🎯 V1 — 可安装·可用·安全"]
        direction TB
        M1["M1 Fork+品牌化+桌面壳 🔨"]
        M2["M2 HYShield+模型配置"]
        M3["M3 Office+可视化+双语"]
        M4["M4 企微/钉钉+MCP+HYPet"]
        M5["M5 3D空间+手机配对"]
        M6["M6 三平台安装包"]
        M1 --> M2 --> M3 --> M4 --> M5 --> M6
    end
    subgraph V2["🔐 V2 — OmniVault"]
        direction TB
        V2A["动态令牌网关"]
        V2B["审计回溯·数据分级"]
        V2C["飞书/邮件渠道·语音输入"]
        V2D["独立手机 App"]
    end
    subgraph V3["🧠 V3 — 天工智脑"]
        direction TB
        V3A["Maestro 多 Agent 编排"]
        V3B["工作流基因记忆"]
        V3C["四级权限委派"]
    end
    V1 --> V2 --> V3
```

### 里程碑进度 | Milestones

| 里程碑 | 内容                              | 状态    |
| ------ | --------------------------------- | ------- |
| M1     | Fork + 品牌化 + Electron 壳       | ✅ 完成 |
| M2     | HYShield 安全围栏 + 模型配置页    | ⏳ 排队 |
| M3     | Office skills + 数据可视化 + 双语 | ⏳ 排队 |
| M4     | 企微/钉钉 + MCP + HYPet 桌宠      | ⏳ 排队 |
| M5     | 智能体空间(3D)+ 手机局域网配对    | ⏳ 排队 |
| M6     | 三平台安装包 + 仓库迁移收尾       | ⏳ 排队 |

## 快速开始 | Quick Start

> 员工用户请等待 M6 安装包(`HYClaw-Setup-x.y.z.exe`,离线安装,向导可自选路径)。以下为开发者路径。

```bash
# 环境:Node ≥22.22 / pnpm 11.2(corepack)
pnpm install                          # 安装依赖
pnpm build                            # 构建 Gateway + 控制台
pnpm --filter @hyclaw/desktop start   # 启动桌面版 🚀
```

## 开发 | Development

```bash
pnpm --filter @hyclaw/desktop test      # 桌面壳单元测试(vitest)
pnpm --filter @hyclaw/desktop pack:dir  # 打包 win-unpacked(不出安装器)
pnpm ui:build                           # 单独构建控制台 UI
```

### 项目结构(相对上游的新增)

```
apps/desktop/        # Electron 桌面壳(主进程/窗口/托盘/网关管理)
branding/            # EFD 品牌资产 + 图标生成管线
packages/hyshield/   # 安全围栏(M2)
skills/hy-office/    # Office skills(M3)
skills/hy-dataviz/   # 可视化 skill(M3)
apps/agent-space/    # Claw3D 智能体空间(M5)
docs/superpowers/    # 设计文档 · 实施计划 · 验收标准
```

### 代码规范

- 上游规范:oxlint + oxfmt + vitest;我们的新代码同样遵守
- TypeScript strict,全 ESM,单文件 <400 行
- 提交格式:`<type>: <description>`(feat/fix/refactor/docs/test/chore)
- **最小侵入原则**:改动收敛在新增目录,便于每月合并上游安全补丁

## 上游同步 | Upstream Sync

```bash
git fetch upstream main
git merge upstream/main   # 每月一次;冲突集中在 README/品牌点,按 ours 处理
pnpm install && pnpm build && pnpm --filter @hyclaw/desktop test
```

## 安全 | Security

HYShield 针对上游已公开的安全问题逐条设防,详见[设计文档第 5 节](docs/superpowers/specs/2026-07-16-hyclaw-v1-design.md)。**一票否决项**:明文密钥落盘、监听 0.0.0.0、安装需联网、个人微信默认开启——任何一条存在,版本不得发布(见[验收标准](docs/superpowers/specs/2026-07-16-hyclaw-v1-acceptance.md))。

发现安全问题请直接联系维护者,勿提公开 issue。

## 许可 | License

[MIT](LICENSE) — 本项目基于[上游开源项目](https://github.com/openclaw/openclaw)(MIT 协议)二次开发,上游版权与许可声明完整保留于 [LICENSE](LICENSE);HYClaw 新增部分 © 2026 EFD 和熠光显。

<div align="center">
<sub>Built with ❤️ by EFD 和熠光显</sub>
</div>
