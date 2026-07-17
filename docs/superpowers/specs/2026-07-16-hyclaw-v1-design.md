# HYClaw V1 设计文档

- 日期:2026-07-16
- 状态:已评审通过(产品负责人确认)
- 上游:[openclaw/openclaw](https://github.com/openclaw/openclaw)(MIT)
- 目标仓库:https://github.com/SuperGokou/hyclaw.git

---

## 1. 产品定位

**HYClaw(和熠智脑)** 是 OpenClaw 的企业化分支,面向 EFD 和熠光显内部员工的**本地优先 AI 工作台**。三个差异化支柱:

1. **安全围栏(HYShield)**——直接回应上游 OpenClaw 公开的安全问题
2. **Office 文档能力**——Word/Excel/PowerPoint/PDF 的读写改与汇总
3. **中文优先双语体验**——zh-CN 默认,en-US 可切换

### 路线图定位

| 阶段 | 内容 |
|------|------|
| **V1(本文档)** | 品牌化桌面版(Win/Mac/Linux)+ HYShield + Office/PDF skills + 数据可视化 + 双语 + 模型配置 + 企微/钉钉渠道 + 桌面伴侣 + 智能体空间(3D)+ 手机互联(IM/局域网) |
| V2 | OmniVault 动态令牌网关、审计回溯、数据分级、飞书/邮件渠道补齐、语音输入、独立手机 App |
| V3 | 多 Agent 编排(Maestro)、工作流基因记忆(含屏幕级工作流录制,配知情同意)、四级权限委派 |

## 2. 部署形态

**每人本地一套**:每个员工安装一份 HYClaw 桌面版,Gateway 跑在本机,数据不出本机;模型调用是唯一出站流量,受 HYShield 管控。桌面壳预留「连接远程 Gateway」的配置项(仅配置项,V1 不实现服务端),为 V2 集中部署留口。

## 3. 总体架构

```
┌─ HYClaw Desktop(Electron 壳)──────────────────┐
│  窗口:品牌化控制台 UI(复用上游 + 增量层)        │
│  增量层:① 品牌/主题 ② 中英 i18n ③ 可视化面板    │
│  智能体空间:Claw3D 3D 虚拟办公室页签             │
│  桌面伴侣(HYPet):悬浮桌宠·语音/文字提示        │
│  主进程:Gateway 子进程管理·托盘·开机自启·更新    │
└──────────────┬──────────────────────────────────┘
               │ localhost WebSocket(仅回环 + 令牌)
               │ ↑ 手机配对模式:仅内网网段+TLS+配对令牌(受控例外)
┌─ HYClaw Gateway(OpenClaw 核心 fork)────────────┐
│  Agent 运行时 ← Skills(Office/PDF/可视化/邮件)  │
│  渠道层:企业微信·钉钉·飞书·(个人微信实验性)     │
│  模型层:Anthropic / OpenAI 兼容 / Ollama 本地    │
├─ HYShield 安全围栏(横切层)─────────────────────┤
│  网络围栏·凭证加密·技能审计·审计日志·注入防护   │
└──────────────────────────────────────────────────┘
```

### 技术路线(已选型:路线 A)

Electron 主进程将 OpenClaw Gateway 作为子进程管理(启动/守护/日志收集),窗口加载 Gateway 自带 Web 控制台,在其上叠加品牌化、i18n、可视化面板三个增量层。理由:最大化复用上游、可持续合并上游安全补丁、工期最短;若 V2/V3 UI 需求超出上游框架,再演进为自研 UI,架构不冲突。

### 代码组织原则

我们的改动尽量放在**新增目录**,对上游文件的侵入式修改控制到最少,降低后续合并冲突:

```
apps/desktop/        # Electron 壳(新增)
packages/hyshield/   # 安全围栏(新增)
packages/hy-i18n/    # 双语资源(新增)
packages/hy-pet/     # 桌面伴侣(新增)
skills/hy-office/    # Office/PDF skills(新增)
skills/hy-dataviz/   # 可视化 skill(新增)
apps/agent-space/    # 智能体空间:Claw3D fork,品牌化+双语(新增)
extensions/hy-wecom/ # 企业微信适配器(新增)
extensions/hy-dingtalk/ # 钉钉适配器(新增)
branding/            # logo、图标、命名替换清单(新增)
```

## 4. 仓库与上游策略

1. Clone `openclaw/openclaw` 全历史
2. 推送到 `github.com/SuperGokou/hyclaw`(main 分支)
3. `origin` 指向 SuperGokou/hyclaw;上游保留为 `upstream` 远程,**用于后续合并安全补丁**,不向上游推送
4. MIT 协议:保留原 LICENSE 与版权声明,新增文件署 EFD 版权头
5. 分支模型:`main`(稳定)+ `dev`(集成)+ 特性分支

## 5. HYShield 安全围栏

针对 OpenClaw 已知安全问题逐条设防:

| 上游问题 | HYShield 对策 |
|---|---|
| Gateway 暴露公网 | 强制只绑定 `127.0.0.1`;启动自检,发现非回环绑定拒绝启动 |
| 无认证/弱认证 | 强制令牌认证;首次启动自动生成,存 OS 凭证库 |
| API key 明文落盘 | 密钥加密存储(Windows DPAPI / macOS Keychain / Linux libsecret);配置文件只存密文引用。此为 OmniVault 的 V1 地基 |
| 恶意 skill 供应链 | 仅加载内置 + 白名单 skills;禁止运行时从网络拉取;skill 清单带哈希校验 |
| 出站流量失控 | 出站域名白名单(默认仅放行已配置的模型 API 域名);全部出站记入审计日志 |
| IM 消息注入攻击 | 非白名单联系人消息默认不进 Agent;文件/链接类内容降权处理 |

审计日志:本地 JSONL,滚动保留 90 天,记录出站请求、凭证使用、skill 加载、渠道消息来源。

## 6. 功能模块

### 6.1 Office 文档(需求 1)

内置 docx / xlsx / pptx / pdf 四个 skills(基于 Anthropic 开源 skills 体系移植)。Agent 可读、写、改、汇总本地文档。文件访问限定在用户指定的「工作区文件夹」内,不允许全盘漫游(HYShield 路径围栏)。

### 6.2 办公连接(需求 2)

| 渠道 | 阶段 | 方式 | 备注 |
|------|------|------|------|
| 企业微信 | V1 | 官方自建应用 API | 稳定 |
| 钉钉 | V1 | 官方机器人/Stream API | 稳定 |
| 通用 MCP 客户端 | V1 | 配置界面 | ERP/数据库/OA 等后续全走 MCP |
| 飞书 | V1.5 | 官方 API | |
| 邮件/日历 | V1.5 | IMAP/SMTP/Exchange skill | |
| 个人微信 | 实验性 | wechaty/pad 协议 | **默认关闭;UI 明示封号风险;建议小号** |

### 6.3 数据可视化(需求 3)

内置 ECharts 可视化面板(控制台增量页签):Agent 分析数据后产出图表规格(JSON),面板实时渲染;支持导出 PNG 及嵌入生成的 Word/PPT 报告。

### 6.4 中英双语(需求 4)

UI 全量 i18n(zh-CN 默认 / en-US),设置一键切换;Agent 系统提示词双语适配,中文问答体验专项调优。

### 6.5 品牌(需求 5)

产品名 HYClaw;EFD logo(源文件 favicon.ico)转出 .ico/.icns/PNG 全套尺寸;窗口图标、托盘、安装器、启动画面、关于页统一换装。

### 6.6 模型接入(需求 6)

设置页三类 Provider:

1. **Anthropic 官方 API**
2. **OpenAI 兼容端点**(DeepSeek / 通义 / Kimi / 内网私有模型,填 base URL)
3. **Ollama 本地模型**

带连通性测试按钮;密钥全部走 HYShield 加密存储。

### 6.7 智能体空间(Claw3D 集成,评审新增)

集成 [Claw3D](https://github.com/iamlukethedev/Claw3D)(MIT,Next.js + React Three Fiber,原生兼容 OpenClaw Gateway 协议)作为 Electron 壳中的「智能体空间」页签——3D 虚拟办公室,可视化智能体的实时活动。

- **定位**:主控制台仍用上游 UI 承担日常操作;Claw3D 用于演示与多 Agent 监控
- **V1 范围**:fork 进本仓库(`apps/agent-space/`),接入本机 Gateway,品牌化(EFD logo/HYClaw 命名)+ 中英双语,随桌面版打包
- **V3 演进**:多 Agent(Maestro)上线后,3D 办公室成为虚拟团队的可视化窗口(领导"看见"各 Sub-Agent 在工位上干活)
- **降级策略**:低配机器可关闭 3D 页签,不影响主功能

### 6.8 手机互联(评审新增)

| 形态 | 阶段 | 说明 |
|------|------|------|
| IM 即手机端 | V1(随 6.2 渠道自动获得) | 手机上用企微/钉钉 @机器人,遣派自己电脑上的 Agent 干活、收结果 |
| 局域网手机浏览器访问 | V1 | 同一 Wi-Fi 下手机扫桌面端二维码配对,浏览器打开 HYClaw 控制台。HYShield 受控例外:默认关闭;开启时仅绑定内网网段、自签 TLS、一次性配对令牌(有效期可配)、桌面端常驻「手机已连接」指示 |
| 独立手机 App | V2 | 原生 iOS/Android,列入 V2 路线图 |

### 6.9 桌面伴侣 HYPet(评审新增)

Agent「随时待命」的悬浮桌宠(类 CC 宠物):

- **形态**:Electron 透明置顶小窗,可拖动、可收起到托盘;全局热键唤起对话
- **提示**:文字气泡 + 语音播报(系统 TTS,中英文);用于任务完成通知、主动建议、日程提醒
- **工作感知(V1 范围)**:前台应用感知(知道你在用 Excel/Word/浏览器,给出情境化建议入口)+ 用户主动触发的截屏求助("看看我这个表怎么做")
- **边界**:持续屏幕级监控/工作流录制**不在 V1**——归入 V3「工作流基因」,届时配知情同意与录制指示灯
- **可关闭**:设置中可完全关闭桌宠与语音

## 7. 安装与分发(需求:像 QClaw 一样)

- **Windows**:electron-builder + NSIS **安装向导**——用户可自选安装路径(默认 `D:\Utility\HYClaw\`),按版本目录安装(`vX.Y.Z\`),带卸载器,与 QClaw 布局一致
- **macOS**:DMG(V1 不签名,内部使用需在安全设置放行;签名/公证列入 V2)
- **Linux**:AppImage + deb
- 安装包**完全离线可装**(捆绑 Node 运行时),不要求用户预装任何环境

## 8. 测试策略

| 层 | 内容 |
|----|------|
| Smoke | 每里程碑:启动→对话→关闭 全链路 |
| HYShield 安全测试 | 端口扫描验证仅回环;磁盘扫描验证无明文密钥;白名单穿透测试;未授权 WS 连接被拒 |
| Skills 集成测试 | 读 Excel 出图表、生成 Word/PPT/PDF 各一条端到端用例 |
| 渠道测试 | 企微/钉钉沙箱应用收发消息 |
| 智能体空间 | 3D 页签加载、Gateway 连接、关闭降级各一条用例 |
| 手机配对测试 | 配对令牌过期失效、非内网网段拒绝、未配对设备拒绝 |
| 打包测试 | 三平台 安装→启动→卸载;Windows 验证自选路径与版本目录 |
| i18n | 双语言快照检查,无硬编码文案 |

## 9. 里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M1 | Fork + 品牌化 + Electron 壳 | Windows 双击启动见 HYClaw 品牌界面,能对话 |
| M2 | HYShield + 模型配置页 | 仅回环绑定、密钥加密落盘、域名白名单生效 |
| M3 | Office skills + 可视化 + 双语 | 中文界面下读 Excel 出图表、生成 Word 报告 |
| M4 | 企微 + 钉钉适配器 + MCP 配置 + HYPet | IM 里 @机器人能干活(即手机端可用);桌宠语音/文字提示可用 |
| M5 | 智能体空间(Claw3D)+ 手机局域网配对 | 3D 页签接入本机 Gateway 并完成品牌化;手机扫码配对后浏览器可访问控制台 |
| M6 | 三平台安装包 + 仓库迁移 | 三平台安装包产物;推送 SuperGokou/hyclaw 完成,origin 切换 |

## 10. 风险清单

| 风险 | 等级 | 缓解 |
|------|------|------|
| 个人微信协议封号 | 高 | 实验性、默认关、小号、UI 风险声明 |
| 上游迭代快、合并冲突 | 中 | 改动收敛到新增目录;定期(月度)合并 upstream |
| Electron 捆绑 Gateway 的进程生命周期管理 | 中 | M1 优先攻坚;崩溃自动重启 + 日志上报到本地 |
| mac/Linux 打包环境缺失(开发机为 Windows) | 中 | CI(GitHub Actions)三平台矩阵打包 |
| 企微/钉钉企业主体审批流程 | 低 | 提前申请自建应用凭证,沙箱先行 |
| Claw3D 增加安装包体积与内存占用 | 中 | 3D 页签懒加载;低配机可关闭;资源压缩 |
| 手机局域网访问扩大攻击面 | 中 | 默认关闭;仅内网网段+TLS+一次性配对令牌;连接状态桌面端可见;审计日志全记录 |
