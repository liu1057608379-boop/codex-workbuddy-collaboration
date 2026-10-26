# 项目空间与可见派工

每个项目保存独立映射：codex_project_root、workbuddy_space_name、workbuddy_workspace、artifact_roots、session_id、task_id、attempt_id、model_confirmation、runtime_source、state。模板见仓库 examples/project-binding.example.json；示例身份是占位值，不能用于实际派工。

Codex 目录、WorkBuddy 空间目录与成果目录可以不同。workspace 必须匹配目标原生会话实际 cwd；任务正文另写允许的成果根。不能将最近窗口、相同空间名称或其他项目历史映射当归属证据。

1. 恢复当前 task/attempt，排除在途重复派工。
2. 按明确空间准备会话；已指定原会话的续做使用该会话。
3. 显示准确的项目、会话与模型，用户确认本轮模型后初始化必要就绪消息；首次实际调用也须匹配。
4. ensure_workspace 显式核 workspace/sessionId，再提交正式任务。工具返回成功不证明界面投影成功，按实际显示核对。
5. 保存映射与确认范围，只覆盖本项目、会话和本轮；新派工、返工或换会话重新确认。
6. 核正文交付、实际执行、身份和结果。UI 延迟时重新观察，不凭旧树重复点击，不因消息未显示就重发任务。

如果 Hub 的 artifact 根不接受外部成果目录，保留旧失败与产物，确认原轮次停止后再讨论合法路线；不能通过关校验、移动原件或符号链接绕过。切换路线不能让旧编号看起来已验收。
