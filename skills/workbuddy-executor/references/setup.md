# 安装与连接

## 先分清两个部分

1. 本仓库的 `skills/workbuddy-executor`：Codex 的协作指令、参考和辅助脚本。
2. 独立完整 Gateway：提供 WorkBuddy MCP、真实桌面会话绑定、队列与回报。本仓库不分发它，也没有已核实的公开安装来源。

没有 Gateway 的新用户应先取得可信、兼容的完整项目和对应安装文档；仅复制本 skill 不能控制 WorkBuddy。不要在本 skill 目录执行 `npm ci`，这里没有 Gateway 的 package.json。不要用同名不明包替代。

## 安装 skill

Windows 默认将整个 `workbuddy-executor` 文件夹复制到 `%USERPROFILE%/.codex/skills/`。macOS/Linux 默认放到 `~/.codex/skills/`。自定义 CODEX_HOME 时使用对应的 skills 目录。保留 scripts、references、agents 层级，不只复制 SKILL.md；若已存在同名 skill 先备份，不覆盖本机专用配置。重新加载 skills 或新开 Codex 对话后调用 `$workbuddy-executor`。

## 已有完整 Gateway

按该完整项目的 README 安装依赖、构建和注册 MCP；不要把下面的历史兼容示例当任意版本通用命令。确认桌面 WorkBuddy 已登录、实际模型可用且无活动任务受影响。已有配置和任务库保持原样，不公开 `.env`。

支持 Windows 适配启动器的版本使用 Node（旧参考最低 22.13.0，以实际项目要求为准）及 `scripts/launch.mjs gateway` 作为 MCP 入口；macOS 部分旧版使用 `bin/workbuddy-gateway`。注册前用 `codex mcp get workbuddy` 核已有配置，以当前 Codex CLI 帮助核实际语法。Windows 不直接执行 macOS shell/LaunchAgent 命令。

常见完整版本包含 `scripts/workbuddy-call.mjs`，可调用同名工具；使用参数文件避免 PowerShell 内联 JSON 转义，调用器复用该完整项目自己的配置。本公开包不含此调用器。

## 首次连接验证

检查一次 health → 核项目 workspace → ensure_workspace 选择/准备原生会话 → 显示会话和模型并取得本轮确认 → 提交小范围探针 → 核真实回报与实际文件。安装成功或服务在线不是业务执行证据。探针也不能证明所有路径和工具兼容。

## 失败恢复

- 工具缺失：核 MCP 注册、Gateway 路径与宿主是否重新加载。
- 未领取：核登录、项目绑定、持久服务及实际错误；不重复提交。
- working 但无正文：保留原编号，核领取轮次及真实副作用，不代 claim 或伪造回报。
- uncertain：核原 request/task/session 的回执，不换幂等键绕过。
- 权限拒绝：只报告脱敏后的具体资源和原因，由用户处理；不自动放开安全规则。

可见会话派工需要支持前台 ConversationBridge 的兼容 Gateway；底层领取不证明用户界面能看到。接口不可用时明确阻塞，不静默改走隐藏执行。
