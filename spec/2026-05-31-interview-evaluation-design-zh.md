# 面试评估设计（中文版）

日期：2026-05-31
作者：Claude Code

目的
---
本设计描述基于 LLM 的自动化面试评估功能，面向求职者的智能模拟面试平台。评估在完整面试结束后自动触发运行，并根据已有的问答记录（qa_records）进行打分，输出结构化 JSON，包含四个维度的分数、理由、引用的证据片段（原文片段）与可操作的提升建议（action items）。

范围
---
- 输入：qa_records（问答记录列表）+ 简历摘要 + referenceContext（评估基线）
- 不评估代码题或执行代码相关检查
- 不在 UI 中显示置信度提示（不含 confidence 字段）
- 评估为异步批量式（面试完成后自动触入选入队列）
- MVP 方案为异步评估任务 + 后端 API（前端展示历史折线图）

设计原则
---
- LLM-first：使用项目现有的 StructuredOutputInvoker 调用 LLM（app/src/main/java/interview/guide/common/ai/StructuredOutputInvoker.java:1），要求返回严格的 JSON 结构。
- 要求 LLM 在每个维度的 rationale 中引用问答原文片段以降低幻觉风险（evidence）。
- evidence 使用原文片段存储（便于前端直接展示，无需 token 索引定位）。
- 优先保证最小可行性（MVP）：异步评估队列、持久化、历史折线图展示；后续可在此基础上扩展验证/校准机制。

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
      "rationale": "...（必须引用问答原文片段）...",
      "evidence": [{"text": "引用的原文片段"}, {"text": "引用的原文片段2"}],
      "actionItems": [
        {"title": "30s 电梯陈述", "difficulty": "easy", "exercise": "在 30 秒内概述项目目标与结果。"}
      ]
    }
  ],
  "raw": {}
}
```

- 不包含 confidence 字段（按你要求去除）。
- 每个被评维度至少包含 1 个 evidence 片段（使用原文片段，便于前端直接展示）。
- raw 字段保存 LLM 返回的原始 JSON 供审计/排错使用。

Prompt 与实现要点
--
- System Prompt：明确评估者身份、评分尺度（0–100 与锚点描述）、必须输出的 JSON schema、每维度需包含 evidence 的规则。提示文件位置：app/src/main/resources/prompts/interview-evaluation-system.st:1 与 app/src/main/resources/prompts/interview-evaluation-user.st:1。
- User Prompt：附上 qa_records（问答记录列表）以及可选候选人目标/岗位信息（短文本）。
- 使用 StructuredOutputInvoker.invokeStructuredOutput(...) 执行并获得结构化 JSON（app/src/main/java/interview/guide/common/ai/StructuredOutputInvoker.java:1）。

持久化与数据模型
--
- 建议新增 JPA 实体：EvaluationScoreEntity（字段示例：id, session_id, dimension, score int, rationale text, evidence jsonb, action_items jsonb, raw_json jsonb, created_at）。建议路径：app/src/main/java/interview/guide/modules/interview/model/EvaluationScoreEntity.java:1。
- 后端 API：GET /api/interview/sessions/{sessionId}/evaluation-details（返回单个面试的四个维度评估详情）。
- 历史查询 API：GET /api/interview/evaluation-history?sessionId={sessionId}&dimension={dimension}（返回评估历史记录）。

UI 展示
--
- 面试详情页：在总得分与总评价的下方显示四维度评分及评价。
- 历史页：按时间顺序展示所有面试的四维度历史折线图。
- 不展示置信度和 token 索引。

API 设计与后端流程
--
- 异步评估：面试完成后自动触入选入评估队列，由 EvaluateStreamConsumer 消费。
- 评估触发时：加载 qa_records + 简历摘要 + referenceContext → 调用 StructuredOutputInvoker → 解析 JSON → 每维度一条记录持久化。

后端架构（MVP）
--
- EvaluationController：提供查询接口
  - GET /api/interview/sessions/{sessionId}/evaluation-details
  - GET /api/interview/evaluation-history?sessionId={sessionId}&dimension={dimension}
- EvaluationScoreRepository：数据访问层
- InterviewEvaluationService：评估逻辑（与评估队列消费者共享使用）

前端 UX（最小可行）
--
- 面试详情页：在总得分与总评价的下方显示四维度评分及评价。
- 历史页：按时间顺序展示所有面试的四维度历史折线图。
- 不展示置信度和 token 索引。

MVP 实现计划（优先可行）
--
1. 在资源目录加入 prompts：app/src/main/resources/prompts/interview-evaluation-*.st:1（将 rubric 嵌入 prompt）。
2. 新建 EvaluationScoreEntity 与对应 Repository & Mapper（app/src/main/java/interview/guide/modules/interview/model/EvaluationScoreEntity.java:1）。
3. 实现异步评估任务队列，在面试完成后自动触发。
4. 创建后端 API 接口：GET /api/interview/sessions/{sessionId}/evaluation-details 和 GET /api/interview/evaluation-history（app/src/main/java/interview/guide/modules/interview/controller/EvaluationController.java:1）。
5. 更新面试详情页：在总分与总评价下方添加四维度评分组件（frontend/src/components/EvaluationSummary.tsx:1）。
6. 创建评估历史页折线图展示（frontend/src/pages/EvaluationHistoryPage.tsx:1）。
7. 实际测试：使用若干示例 qa_records 做本地测试，验证 LLM 输出与 JSON 解析正确。

后续改进（可选）
--
- 若未来需要提高可信度，可引入 Hybrid rule+LLM（对可验证事实做规则检查）或 Ensemble 验证器。
- 若对准确性有更高要求，再考虑添加置信度与在线/离线校准流程。
- 可扩展"生成练习计划"与"批量复习队列"功能，并实现可导出 PDF 报告（PdfExportService 已存在：app/src/main/java/interview/guide/infrastructure/export/PdfExportService.java:1）。

变更记录
--
- 2026-05-31：初始设计，LLM-first，四个维度（Communication、Technical Knowledge、Problem Solving、Project Storytelling），基于 qa_records 的批次评估，异步触发，历史页折线图展示，面试详情页四维度评分组件，evidence 使用原文片段。
