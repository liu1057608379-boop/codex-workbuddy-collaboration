---
name: workbuddy-executor
description: 用户要求将任务交给桌面 WorkBuddy 执行、接收反馈、返工或验收时使用。按项目绑定空间、目录和可见原生会话，确认模型后派工；支持已有任务恢复与检查点接力。普通 Codex 独立任务不触发。
---

# WorkBuddy 执行官

Codex 负责目标规划、关键判断、独立验收与集中反馈；真实桌面 WorkBuddy 使用本轮确认的模型和自身工具执行、自测。先确保结果质量，再减少重复读取与整轮成本；没有用量数据不宣称节省比例。

## 前提与边界

本公开包包含 skill、参考文档与检查点辅助脚本，**不包含 Gateway 服务、MCP 服务端、依赖、账号或任务库**。先定位用户已安装的兼容完整 Gateway；首次接入或连接异常读 [连接步骤](references/setup.md)。不能把只有本 skill 的目录当完整 Gateway，也不能虚构下载地址。

没有对应服务时说明缺项，可以整理任务计划，不能声称已向 WorkBuddy 派工。接口随 Gateway 版本变化，以完整项目文档和已加载工具 schema 为准。

## 项目与模型

- 每个项目独立记录 Codex 项目根、WorkBuddy 空间与真实 workspace、sessionId、授权成果根和当前 task/attempt；不要默认选择最近会话或套用别人的路径。映射不明先只读核对，仍不明确再问目标空间与目录。详见 [项目映射](references/project-routing.md)。
- 每次新派工、外部返工或换会话前，显示正确的 WorkBuddy 会话与模型，取得本轮明确确认；同一确认范围不重复询问。历史确认、后台元数据及执行器自述不能替代本轮可见确认。实际选择和调用模型不一致时停止未开始的业务派工，按 [初始化排查](references/windows-permissions.md) 处理。
- 若需要操作桌面，使用宿主可用的 Computer Use 技能并遵守其规则。UI 用于显示、选择与非业务就绪消息；正式任务经 Gateway 派发。不要借 UI 代运行终端指令。

## 派工与恢复

1. 先恢复已知编号：`hub-…` 走 Hub；直连 taskId 走原 WorkBuddy 接口。未知回执、断线或等待超时都不授权重复提交。无已知任务时才小范围列任务，首次连接检查一次 health。
2. 确认项目映射后，使用兼容 Gateway 的 `workbuddy_ensure_workspace({workspace,sessionId})` 选择或准备真实会话；sessionId 可在首次创建时省略。创建结果不确定时核预留身份，不能循环创建。发送前完成上述模型确认。
3. 默认使用 `workbuddy_send_task`，显式传匹配的 workspace/sessionId、稳定 taskId。写清目标、允许修改的范围、真实成果路径、验收标准、期限与禁止事项；参数名以当前工具 schema 为准。desktop-queue 使用 existing 会话，不传远程 model 覆盖，不用 `sessionMode:new` 代替绑定流程。
4. WorkBuddy 可自主选工具、实现、自测和修复。关键架构不确定或同一失败两次未解时，回报最小复现给 Codex；先推进其余已具备条件的工作。接手前明确文件归属与防并发，不能把 Codex 的操作记作 WorkBuddy 证据。
5. 保存 taskId、attemptId、sessionId、runtimeSource 和状态。queued 仅表示受理；working 仅说明领取记录。还需核实正文交付、实际工具活动与回报，不能以动画或原生 busy 宣称执行成功。

任务附简短回报契约：

> 用本桌面会话自己的工具完成并自检；只改授权范围，不改桥接器、配置或自行写记忆。回报状态、简短结果、真实成果路径、测试/来源证据、未解决问题与额外修改。完整日志和大段成果保留文件；使用本轮 claim 的身份与凭证 report，不在公开回报中披露凭证。

## 精简监督

支持时使用 `detail: brief`，不支持的旧工具不传此字段。`workbuddy_wait` 采用约 40–50 秒有界等待；状态不变继续等原任务，不重复读全日志或重派。queued 多轮不变检查一次实际连接/登录/绑定原因；working 不因短时安静就判失败。期限届满报告阻塞，不自动重执行。

`needs_review` 表示待验收；`blocked/failed/cancelled` 不报成功。`cancel_requested` 不证明已停止，未知回执保留原编号核查。应用崩溃或领取未闭合时先核原会话与已有文件；不删 claim、不手改原生数据库、不伪造 report。原生回复结束后持久服务空队列无需模型空轮询，具体生命周期以已安装服务文档为准。

## 验收与返工

核对本轮身份、`runtimeSource: desktop_queue` 与真实成果。读关键内容、相关 diff 与必要测试；心跳、文件非空或执行器自述不能代替业务验收。回报截断影响判断时再读完整必要部分。

不合格且原轮次已结束：先完成本轮模型确认，直连用 `workbuddy_continue_task`，Hub 用 `agent_hub_rework`，集中给具体问题及改好标准。保留原目标和授权范围；不重叠执行。

实际检查通过后，用 `workbuddy_accept_task` 或 `agent_hub_accept` 保存具体 evidence 和真实成果路径；accept 只记录验收，不自动检查。用户自行验收时保留待验收状态。最终给完成状态、成果入口与影响使用的未解决问题。

## 可选模式

- 用户明确选择 Hub 或恢复原 Hub 编号时读 [Agent Hub](references/agent-hub.md)，不擅自转换已有任务链。
- 用户要求长任务跨会话接力时读 [检查点接力](references/context-handoff.md)，使用随包脚本；先确认 Gateway 内部 API 兼容。新段发送前仍需新会话模型确认。

## 真实限制

本 skill 不提供物理隔离或会话级加密认证；Gateway 不自动采集全部原生工具轨迹。电脑关机、登出或登录失效时不能保证执行，不自动唤醒退出的 Codex。不能精确读取剩余 token，不把普通失败冒充上下文耗尽。新机器和 WorkBuddy/Gateway 新版本需重新核对兼容性；本公开包的脚本保护测试不等于真实桌面端到端验证。
