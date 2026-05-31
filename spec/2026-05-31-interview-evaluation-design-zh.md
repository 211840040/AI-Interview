# 面试评估设计

日期：2026-05-31
作者：Claude Code

目的
--
本设计描述基于 LLM 的自动化面试评估功能，面向求职者的智能模拟面试平台。评估在完整面试结束后运行，输入为面试过程的文字化 transcript，输出结构化 JSON，包含四个维度的分数、理由、引用的证据片段与可操作的提升建议（action items）。

范围
--
- 输入：整个面试的文字化 transcript（ASR 输出或文本输入）
- 不评估代码题或执行代码相关检查
- 不在 UI 中显示置信度提示（不含 confidence 字段）
- 评估为批次式（在面试结束后触发，而非实时流式）
- MVP 方案为同步评估接口，返回 JSON 并持久化用于历史展示

设计原则
--
- LLM-first：使用项目现有的 StructuredOutputInvoker 调用 LLM（app/src/main/java/interview/guide/common/ai/StructuredOutputInvoker.java:1），要求返回严格的 JSON 结构。
- 要求 LLM 在每个维度的 rationale 中引用 transcript 片段以降低幻觉风险（evidence）。
- 优先保证最小可行性（MVP）：同步接口、持久化、前端展示历史曲线；后续可在此基础上扩展验证/校准机制。

评估维度与 5‑点锚定规则（0–100）
--
统一锚点：Excellent (90–100)、Good (70–89)、Fair (50–69)、Poor (30–49)、Unintelligible (0–29)。

1) 口头表达（Communication）
- Excellent (90–100)：结构清晰、表达简洁、有明确结论，几乎无填充词或长停顿。
- Good (70–89)：总体清晰，有少量填充词或轻微重复。
- Fair (50–69)：结构或逻辑不够紧凑，存在明显重复或离题。
- Poor (30–49)：频繁停顿/填充词，难以抓住要点。
- Unintelligible (0–29)：回答无法理解或未作答。

2) 技术知识（Technical Knowledge）
- Excellent：概念准确、能解释原理并举例。
- Good：概念正确但深度或例子不足。
- Fair：有模糊或部分不准确的表述。
- Poor：明显错误或非常浅薄。
- Unintelligible：无相关技术内容。

3) 问题解决（Problem Solving）
- Excellent：思路分解清晰、考虑边界与 trade-offs、复杂度意识强。
- Good：方法合理、部分细节欠缺。
- Fair：思路零散或遗漏重要边界。
- Poor：无清晰方法或逻辑错误。
- Unintelligible：未尝试或无法判断。

4) 项目叙述（Project Storytelling）
- Excellent：明确职责与贡献、说明挑战并量化结果/影响。
- Good：描述清楚但缺乏量化指标或影响细节。
- Fair：对贡献或结果表述含糊。
- Poor：难以判断贡献或影响。
- Unintelligible：无项目叙述。

结构化输出（示例 JSON 模式）
--
要求 LLM 严格返回如下结构（示例）：

```json
{
  "overallScore": 0,
  "dimensions": [
    {
      "name": "Communication",
      "score": 0,
      "anchorLabel": "Good",
      "rationale": "...（必须引用 transcript 片段）...",
      "evidence": [{"startToken": 123, "endToken": 150, "text": "..."}],
      "actionItems": [
        {"title": "30s 电梯陈述", "difficulty": "easy", "exercise": "在 30 秒内概述项目目标与结果。"}
      ]
    }
  ],
  "raw": {}
}
```

- 不包含 confidence 字段（按你要求去除）。
- 每个被评维度至少包含 1 个 evidence 片段（可用 token 索引或文本切片表示）。
- raw 字段保存 LLM 返回的原始 JSON 供审计/排错使用。

Prompt 与实现要点
--
- System Prompt：明确评估者身份、评分尺度（0–100 与锚点描述）、必须输出的 JSON schema、每维度需包含 evidence 的规则。提示文件位置：app/src/main/resources/prompts/interview-evaluation-system.st:1 与 app/src/main/resources/prompts/interview-evaluation-user.st:1。
- User Prompt：附上完整 transcript 以及可选候选人目标/岗位信息（短文本）。
- 使用 StructuredOutputInvoker.invokeStructuredOutput(...) 执行并获得结构化 JSON（app/src/main/java/interview/guide/common/ai/StructuredOutputInvoker.java:1）。

持久化与数据模型
--
- 建议新增 JPA 实体：EvaluationScoreEntity（字段示例：id, session_id, user_id, dimension, score int, rationale text, evidence_json jsonb, action_items_json jsonb, raw_json jsonb, created_at）。建议路径：app/src/main/java/interview/guide/modules/interview/model/EvaluationScoreEntity.java:1。
- 在 InterviewReportDTO 中加入评估摘要字段（app/src/main/java/interview/guide/modules/interview/model/InterviewReportDTO.java:1）。
- 更新映射器：InterviewMapper（app/src/main/java/interview/guide/infrastructure/mapper/InterviewMapper.java:1）以支持 DTO ↔ Entity 的转换。

API 设计与后端流程
--
- POST /api/interview/{sessionId}/evaluate
  - 同步触发：由服务端构建 prompt（包含 transcript），调用 StructuredOutputInvoker，解析返回 JSON，持久化 EvaluationScoreEntity 条目并返回给前端。
- GET /api/users/{userId}/evaluations?dimension=Communication
  - 返回某维度的时间序列（用于前端折线图）。
- 服务调用链（同步、MVP）：
  InterviewSessionService -> UnifiedEvaluationService（或相似 service）-> StructuredOutputInvoker.invokeStructuredOutput(...) -> 解析并 persist -> 返回结果（参考实现点：app/src/main/java/interview/guide/common/evaluation/UnifiedEvaluationService.java:1 与 modules/interview/service/InterviewSessionService 的实现位置 app/src/main/java/interview/guide/modules/interview/service/InterviewSessionService.java:1）。

前端 UX（最小可行）
--
- 会话结束页（即时显示）：顶部 overall 卡片 + 四个维度卡片（分数 + 主要 action item），“查看证据”打开 transcript 文本并高亮对应片段。建议组件路径参考：frontend/src/components/EvaluationSummary.tsx:1、frontend/src/components/EvaluationDetail.tsx:1。
- 历史页：按维度切换的折线图（Recharts），时间窗口（7/30/90 天），点击某个点显示该次的 rationale 与 evidence，并可将 actionItems “加入训练计划”（后续功能）。工具函数参考：frontend/src/utils/score.ts:1。
- 不在 UI 中展示置信度提示（应用户要求移除）。

MVP 实现计划（优先可行）
--
1. 在资源目录加入 prompts：app/src/main/resources/prompts/interview-evaluation-*.st:1（将 rubric 嵌入 prompt）。
2. 新建 EvaluationScoreEntity 与对应 Repository & Mapper（app/src/main/java/interview/guide/modules/interview/model/EvaluationScoreEntity.java:1）。
3. 实现 UnifiedEvaluationService.evaluate(sessionId) 调用 StructuredOutputInvoker 并解析 JSON（app/src/main/java/interview/guide/common/evaluation/UnifiedEvaluationService.java:1）。
4. 在 InterviewController 中加入 POST /api/interview/{sessionId}/evaluate 接口，调用 InterviewSessionService（app/src/main/java/interview/guide/modules/interview/InterviewController.java:1）。
5. 前端：实现 EvaluationSummary 组件并在会话结束页调用评估接口显示结果（frontend/src/components/EvaluationSummary.tsx:1）。
6. 实际测试：使用若干示例 transcript 做本地测试，验证 LLM 输出与 JSON 解析正确。

后续改进（可选）
--
- 若未来需要提高可信度，可引入 Hybrid rule+LLM（对可验证事实做规则检查）或 Ensemble 验证器。
- 若对准确性有更高要求，再考虑添加置信度与在线/离线校准流程。
- 可扩展“生成练习计划”与“批量复习队列”功能，并实现可导出 PDF 报告（PdfExportService 已存在：app/src/main/java/interview/guide/infrastructure/export/PdfExportService.java:1）。

变更记录
--
- 2026-05-31：初始设计，LLM-first，四个维度（Communication、Technical Knowledge、Problem Solving、Project Storytelling），基于完整 transcript 的批次评估，UI 不显示置信度字段。

小结
--
我已把英文设计文档翻译为中文并保存为 spec/2026-05-31-interview-evaluation-design-zh.md；如需我将该中文文件一起暂存（git add）或覆盖已暂存的英文版，请告诉我你的选择。