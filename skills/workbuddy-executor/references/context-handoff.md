# 检查点驱动的会话接力

每次新段发送前需用户在正确会话确认模型；脚本会停在 awaiting_model_confirmation。仅在获得真实确认后写入对应计划 SHA、taskId、sessionId、model、confirmed_at 与 explicit_user_confirmation 的回执，不能自行伪造。

适用：用户要求 WorkBuddy 长任务连续执行，且已授权原目标及工作目录。Codex 仍负责方案、复杂判断和最终验收。此机制不增加生产、上传、付费或数据修改授权。

## 实现与边界

`scripts/context-relay.mjs` 监督一个已存在的真实 taskId。明确 `CONTEXT_HANDOFF_REQUIRED` 回报、已结束的 provider attempt、原生会话 idle、合法检查点和文件指纹全部满足后，持久预留新 UUID → 原生创建同目录会话 → 显式绑定 → 等用户可见模型确认 → 发送带检查点的新稳定 taskId。保留每段旧任务，不修改旧任务会话归属。新段沿用兼容直连；原 Hub 任务不会自动变成整个接力链已通过。

无法精确读取剩余 token，不宣称实际耗尽上下文。正常派工必须要求执行器每阶段落盘，并在还能写入时主动发接力信号；普通权限、额度、接口错误及未知硬中断不能冒充上下文接力。硬中断先核副作用，由 Codex 恢复，禁止自动重放。

该脚本只监督 WorkBuddy，不自动唤醒退出的 Codex，也不把全部聊天搬到新会话。恢复依赖实际文件、版本指纹、未完成项和明确的续做方案。电脑关机/注销时不能执行；同一计划重启可以继续，但留有 lock 时先核原 PID 是否存在，禁止盲删锁。原生创建结果不确定保留 reserved ID，不循环造会话。

## 最小计划（由 Codex 写，执行方不可改）

先恢复已知 Hub/taskId，确认没有重复派工，再写项目内不可变计划：

```json
{
  "gatewayRoot": "C:/absolute/gateway-installation",
  "workspace": "C:/absolute/project",
  "initialTaskId": "existing-provider-task-id",
  "parentHubId": "hub-existing-id",
  "checkpointFile": "gateway-continuation.json",
  "maxRotations": 3,
  "watchSeconds": 7200,
  "taskTimeoutSeconds": 1800,
  "continuationObjective": "明确全部目标、只续做范围、必须读取的总方案/剩余清单及最终交底要求",
  "constraints": ["原授权允许修改的具体目录；不得扩大权限"]
}
```

无 Hub 的兼容直连任务省略 `parentHubId`；Hub 父段要核 providerTaskId/attempt/session 一致且 holdsCapacity=false 后才切。不要把 Hub 管理的活动任务偷偷转换为另一条执行链。父段仍在执行只监督，不再发送业务目标。

检查点另在授权目录时，计划可显式设绝对 `checkpointFile`、`checkpointRoot` 和 `evidenceRoots`；不能任由执行器声明任意外部目录。通常保持检查点与成果在同一个项目目录。

## 执行器检查点契约

每个安全边界写入下列身份和内容，身份使用本轮真实 claim 的值：

```json
{
  "signal": "CONTEXT_HANDOFF_REQUIRED",
  "task_id": "actual-task-id",
  "session_id": "actual-native-session-id",
  "attempt_id": "actual-attempt-id",
  "safe_to_resume": true,
  "inflight": [],
  "done": ["已完成内容及证据"],
  "remaining": ["剩余内容与下一固定命令"],
  "files": [{"path":"relative/or/authorized/absolute/file", "sha256":"actual raw-byte sha256"}]
}
```

`safe_to_resume` 只能在没有未确认数据库事务、未完成写进程或未知外部副作用时为 true。实际文件 SHA 不符即停止，不自动接受新指纹。更新检查点后 report blocked，正文包含信号，并正常结束回复；不要自己创建新会话或循环空等。

## 启动与恢复

前台：`node <skill>/scripts/context-relay.mjs <absolute-plan.json>`。

需离开 Codex 后持续监督时，用 `scripts/start-context-relay.ps1 -Plan <absolute-plan.json> -Node <absolute-node.exe>` 启动隐藏进程。检查 `<plan>.launcher.json`、`<plan>.state.json` 和 stderr；启动 receipt 不等于任务已执行。进程只到计划期限，空闲等待不调用模型；到期保持状态，重跑同一计划继续。已完成计划重跑直接返回，不再派发。

新 Codex 对话先读 Skill，再读项目计划和 `.state.json` 的 currentTaskId/history；恢复同一链，不另造首任务。新会话即使自报 completed 仍需核真实结果、runtimeSource 和身份后独立验收，不能将 controller 的 completed 当业务已通过。

## 兼容性与验证边界

辅助脚本依赖完整 Gateway 的 dist 内部接口，并非通用 MCP 客户端；升级后先核兼容。随包单元测试覆盖检查点身份、文件哈希、越界、未确认副作用、Hub 轮次及安全读重试等保护。本公开版本不以这些测试声称跨平台桌面实测、真实 token 耗尽或系统重启恢复通过。
