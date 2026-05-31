# 面试评估（LLM 自动评分）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有模拟面试系统上实现一个 LLM-first 的多维度面试评估功能（在面试结束后对 qa_records 打分并返回结构化结果），首版评估维度为：口头表达、技术知识、问题解决、项目叙述。评估基于 qa_records（问答记录），历史页展示所有面试的四维度历史折线图，面试详情页总分下方显示四维度评分及提升建议。

**Architecture:** 后端设置面试完成时自动触发的异步评估任务队列，调用 StructuredOutputInvoker 请求 LLM 返回严格 JSON（不含 confidence 字段），解析后每维度一条记录持久化到 evaluation_scores 表；前端在面试详情页和面试记录页展示评估结果。

**Tech Stacks:** Java 21, Spring Boot 4, JPA, PostgreSQL (JSONB), React + TypeScript (Vite), Recharts（折线图）, JUnit5 + Mockito。

---

## 一、概要

- **目标：** 实现一个在面试结束后基于 qa_records 的多维度自动评估功能，LLM 返回结构化 JSON（不含 confidence 字段），包含四个维度分数、理由、引用的证据片段（原文片段）与可操作的提升建议，持久化以支持历史曲线展示与回顾。
- **限制条件：**
  - LLM-first：使用现有 StructuredOutputInvoker 调用 LLM
  - 四维度评估维度（Communication, Technical Knowledge, Problem Solving, Project Storytelling）
  - 基于问答记录（qa_records + 简历摘要 + 评估基线），而非完整 transcript
  - 不评估代码题或执行代码相关检查
  - 异步评估（面试完成后自动触入选入队列）
  - 不在 UI 显示置信度字段
  - evidence 使用原文片段存储（便于前端直接展示）
  - MVP 方案：面试完成后自动触发异步评估，异步消费者调用后端 API。

---

## 二、MVP 任务清单（按优先级排序）

### Task 1: 编写 Prompt 模块（原有评估 + 多维度评估）

**标题（TaskCreate）：** `write: prompts - evaluation (原有) + multipole (多维度)`

**描述：** 保留原有 interview-evaluation-system.user.st 用于分批评估问答记录（准确性、完整性、深度、表达）；新建 interview-evaluation-multipole-system.st 与 interview-evaluation-multipole-user.st 用于多维度整体评估（口头表达、技术知识、问题解决、项目叙述）。两套 prompt 互不重叠，输入均为 qaRecords（问答记录列表）+ 简历摘要 + referenceContext（评估基线），使用问答记录作为评估依据。

**变更文件：**
- Create: `app/src/main/resources/prompts/interview-evaluation-multipole-system.st`
- Create: `app/src/main/resources/prompts/interview-evaluation-multipole-user.st`

**原有 Prompt 保留（不修改）：**
- `app/src/main/resources/prompts/interview-evaluation-system.st`
- `app/src/main/resources/prompts/interview-evaluation-user.st`
- `app/src/main/resources/prompts/interview-evaluation-summary-system.st`
- `app/src/main/resources/prompts/interview-evaluation-summary-user.st`

---

#### 1.1: 新建 interview-evaluation-multipole-system.st

```st
# Role
你是一位专业的面试评估员，专注于从候选人回答的整体表现中识别优势与改进空间。你具备四个维度的评估能力：口头表达、技术知识、问题解决、项目叙述。评分范围为 0-100 分。

# Evaluation Dimensions (评分维度) 综合评分

| 维度 | 评分范围 | 锚点描述 |
|------|---------|---------|
| 口头表达 (Communication) | 90-100 Excellent | 结构清晰、表达简洁、有明确结论，几乎无填充词或长停顿 |
|   | 70-89 Good | 总体清晰，少量填充词或轻微重复 |
|   | 50-69 Fair | 结构或逻辑不够紧凑，明显重复或离题 |
|   | 30-49 Poor | 频繁停顿/填充词，难以抓住要点 |
|   | 0-29 Unintelligible | 回答无法理解或未作答 |

| 技术知识 (Technical Knowledge) | 90-100 Excellent | 概念准确、能解释原理并举例 |
|                                 | 70-89 Good | 概念正确但深度或例子不足 |
|                                 | 50-69 Fair | 有模糊或部分不准确的表述 |
|                                 | 30-49 Poor | 明显错误或非常浅薄 |
|                                 | 0-29 Unintelligible | 无相关技术内容 |

| 问题解决 (Problem Solving) | 90-100 Excellent | 思路分解清晰、考虑边界与 trade-offs、复杂度意识强 |
|                            | 70-89 Good | 方法合理、部分细节欠缺 |
|                            | 50-69 Fair | 思路零散或遗漏重要边界 |
|                            | 30-49 Poor | 无清晰方法或逻辑错误 |
|                            | 0-29 Unintelligible | 未尝试或无法判断 |

| 项目叙述 (Project Storytelling) | 90-100 Excellent | 明确职责与贡献、说明挑战并量化结果/影响 |
|                                  | 70-89 Good | 描述清楚但缺乏量化指标或影响细节 |
|                                  | 50-69 Fair | 对贡献或结果表述含糊 |
|                                  | 30-49 Poor | 难以判断贡献或影响 |
|                                  | 0-29 Unintelligible | 无项目叙述 |

# Input Data Format
QA 记录格式：
- question: 问题文本
- userAnswer: 用户回答文本
- score: 逐题评分（0-100）
- feedback: 逐题反馈

# Evaluation Workflow
1. 逐维度评估：基于问答记录为四个维度各打同一分数（0-100）
2. 每维度给出 rationale（必须引用问答原文作为证据）
3. 每维度给出 2-3 个可操作的提升建议 (action items)
4. 计算综合评分（四个维度分数的平均值，保留整数）
5. 输出 JSON 格式（不能添加其他描述性文字）

# Output Format

你必须严格输出如下 JSON 格式（不可添加任何额外的 text 或 markdown 块标记）：

```json
{
  "overallScore": <整数 0-100>,
  "dimensions": [
    {
      "name": "Communication",
      "score": <0-100, 整数>,
      "anchorLabel": "<Excellent|Good|Fair|Poor|Unintelligible>",
      "rationale": "<必须引用问答原文片段>",
      "evidence": [
        {"text": "引用的原文片段"},
        {"text": "引用的原文片段2"}
      ],
      "actionItems": [
        {"title": "<建议标题>", "difficulty": "<easy|medium|hard>", "exercise": "<可执行练习>"},
        {"title": "...", "difficulty": "...", "exercise": "..."}
      ]
    }
    "...Communication的其他维度（Technical Knowledge、Problem Solving、Project Storytelling）"
  ]
}
```

# Constraints
- overallScore 为四个维度分数的算术平均值（向下去整）
- rationale 必须引用至少 2 条问答原文片段
- 若问答记录无法评估某维度，score 设为 0，anchorLabel="Insufficient Data"
- 不包含 confidence 字段（UI 不需要）
- 输出必须是纯 JSON，不要包含 markdown 代码块标记
```

---

#### 1.2: 新建 interview-evaluation-multipole-user.st

```st
# Input Data
请基于以下候选人面试问答记录，进行多维度整体评估。

## 问答记录
---问答记录开始---
{qaRecords}
---问答记录结束---

## 参考答案基线（用于辅助评估，不是唯一标准）
{referenceContext}

## 评估要求
1. 逐维度评估四个维度的整体表现（口头表达、技术知识、问题解决、项目叙述）
2. 每个维度必须有引用问答原文的 rationale
3. 每个维度给出 2-3 个可操作的提升建议 (action items)
4. 计算四个维度平均分为 overallScore
5. 严格按照系统指令中定义的评分规则和 JSON 格式输出评估结果。
```

---

### Task 2: 新增 EvaluationScoreEntity + Repository

**标题（TaskCreate）：** `add: EvaluationScoreEntity + repo`

**描述：** 新增 EvaluationScoreEntity 与 EvaluationScoreRepository 以持久化每个维度的评估记录。

**变更文件：**
- Create: `app/src/main/java/interview/guide/modules/interview/model/EvaluationScoreEntity.java`
- Create: `app/src/main/java/interview/guide/modules/interview/repository/EvaluationScoreRepository.java`

**步骤：**

- [ ] **Step 1: 新建 EvaluationScoreEntity**

```java
package interview.guide.modules.interview.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "evaluation_scores")
public class EvaluationScoreEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "dimension", nullable = false, length = 64)
    private String dimension; // Communication, Technical Knowledge, Problem Solving, Project Storytelling

    @Column(name = "score", nullable = false)
    private Integer score;

    @Column(name = "anchor_label", length = 32)
    private String anchorLabel;

    @Column(name = "rationale", columnDefinition = "TEXT")
    private String rationale;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "evidence", columnDefinition = "jsonb")
    private String evidence; // [{"text": "引用的原文片段"}, ...]

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "action_items", columnDefinition = "jsonb")
    private String actionItems; // [{"title": "...", "difficulty": "...", "exercise": "..."}, ...]

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_json", columnDefinition = "jsonb")
    private String rawJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
```

- [ ] **Step 2: 新建 EvaluationScoreRepository**

```java
package interview.guide.modules.interview.repository;

import interview.guide.modules.interview.model.EvaluationScoreEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EvaluationScoreRepository extends JpaRepository<EvaluationScoreEntity, Long> {

    List<EvaluationScoreEntity> findBySessionId(Long sessionId);

    List<EvaluationScoreEntity> findByDimensionOrderByCreatedAtAsc(
            String dimension);

    List<EvaluationScoreEntity> findBySessionIdAndDimensionOrderByCreatedAtAsc(
            Long sessionId, String dimension);
}
```

---

### Task 3: 创建评估 API 端点

**标题（TaskCreate）：** `api: add evaluation endpoint`

**描述：** 创建后台评估端点 GET /api/interview/sessions/{sessionId}/evaluation-details，返回单个面试的四个维度评估详情。

**变更文件：**
- Create: `app/src/main/java/interview/guide/modules/interview/controller/EvaluationController.java`
- Modify: `app/src/main/java/interview/guide/modules/interview/service/InterviewSessionService.java` (添加方法获取评估详情)

**步骤：**

- [ ] **Step 1: 新建 EvaluationController**

```java
package interview.guide.modules.interview.controller;

import interview.guide.common.result.Result;
import interview.guide.modules.interview.model.EvaluationScoreEntity;
import interview.guide.modules.interview.service.InterviewEvaluationService;
import interview.guide.modules.interview.service.InterviewSessionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/interview")
@RequiredArgsConstructor
public class EvaluationController {

    private final InterviewEvaluationService interviewEvaluationService;
    private final InterviewSessionService interviewSessionService;

    @GetMapping("/sessions/{sessionId}/evaluation-details")
    public ResponseEntity<Result<List<EvaluationScoreEntity>>> getEvaluationDetails(
            @PathVariable Long sessionId) {
        List<EvaluationScoreEntity> scores = interviewEvaluationService.getScoreBySessionId(sessionId);
        return ResponseEntity.ok(Result.success(scores));
    }
}
```

- [ ] **Step 2: 实现 InterviewEvaluationService.getScoreBySessionId()**

```java
public List<EvaluationScoreEntity> getScoreBySessionId(Long sessionId) {
    return evaluationScoreRepository.findBySessionId(sessionId);
}
```

---

### Task 4: 创建历史评估 API 端点

**标题（TaskCreate）：** `api: add evaluation history endpoint`

**描述：** 创建历史评估端点 GET /api/interview/evaluation-history?sessionId={sessionId}&dimension={dimension}，返回指定会话的评估历史记录。

**变更文件：**
- Create: `app/src/main/java/interview/guide/modules/interview/controller/EvaluationHistoryController.java`
- Modify: `app/src/main/java/interview/guide/modules/interview/repository/EvaluationScoreRepository.java`

**步骤：**

- [ ] **Step 1: 新建 EvaluationHistoryController**

```java
package interview.guide.modules.interview.controller;

import interview.guide.common.result.Result;
import interview.guide.modules.interview.model.EvaluationScoreEntity;
import interview.guide.modules.interview.repository.EvaluationScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/interview")
@RequiredArgsConstructor
public class EvaluationHistoryController {

    private final EvaluationScoreRepository evaluationScoreRepository;

    @GetMapping("/evaluation-history")
    public ResponseEntity<Result<List<EvaluationScoreEntity>>> getEvaluationHistory(
            @RequestParam(required = false) Long sessionId,
            @RequestParam(required = false) String dimension) {

        List<EvaluationScoreEntity> history;

        if (sessionId != null && dimension != null) {
            // 查询指定会话的指定维度记录
            history = evaluationScoreRepository.findBySessionIdAndDimensionOrderByCreatedAtAsc(sessionId, dimension);
        } else if (sessionId != null) {
            // 查询指定会话的所有维度记录
            history = evaluationScoreRepository.findBySessionId(sessionId);
        } else if (dimension != null) {
            // 查询指定维度的所有记录（按时间排序）
            history = evaluationScoreRepository.findByDimensionOrderByCreatedAtAsc(dimension);
        } else {
            return ResponseEntity.badRequest().body(Result.error(1001, "必须提供 sessionId 和/或 dimension 参数"));
        }

        return ResponseEntity.ok(Result.success(history));
    }
}
```

- [ ] **Step 2: 在 EvaluationScoreRepository 添加方法**

```java
List<EvaluationScoreEntity> findBySessionIdAndDimensionOrderByCreatedAtAsc(
        Long sessionId, String dimension);
```

---

### Task 5: 创建前端 API 客户端

**标题（TaskCreate）：** `frontend: add evaluation API clients`

**描述：** 创建前端评估相关的 API 客户端和类型定义。

**变更文件：**
- Create: `frontend/src/api/evaluation.ts`
- Modify: `frontend/src/types/interview.ts` (添加评估相关类型)

**步骤：**

- [ ] **Step 1: 新增 evaluation.ts**

```typescript
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface EvidenceItem {
  text: string;
}

export interface ActionItem {
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  exercise: string;
}

export interface DimensionScore {
  name: 'Communication' | 'Technical Knowledge' | 'Problem Solving' | 'Project Storytelling';
  score: number;
  anchorLabel: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unintelligible' | 'Insufficient Data';
  rationale: string;
  evidence: EvidenceItem[];
  actionItems: ActionItem[];
}

export interface EvaluationResult {
  sessionId: string;
  dimension: string;
  score: number;
  anchorLabel: string;
  rationale: string;
  evidence: EvidenceItem[];
  actionItems: ActionItem[];
  createdAt: string;
}

export interface EvaluationDetail {
  sessions: Array<{
    sessionId: string;
    createdAt: string;
    score: number;
    dimension: string;
  }>;
}

export const evaluationApi = {
  /**
   * 获取指定会话的评估详情
   */
  async getEvaluationDetails(sessionId: string): Promise<EvaluationResult[]> {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/evaluation-details`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || '获取评估详情失败');
    }
    const body = await res.json();
    return body.data;
  },

  /**
   * 获取评估历史记录
   * @param sessionId 可选，指定会话 ID
   * @param dimension 可选，指定维度名
   */
  async getEvaluationHistory(sessionId?: string, dimension?: string): Promise<EvaluationResult[]> {
    const params = new URLSearchParams();
    if (sessionId) params.set('sessionId', sessionId);
    if (dimension) params.set('dimension', dimension);
    const res = await fetch(`${API_BASE}/evaluation-history?${params}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || '获取评估历史失败');
    }
    const body = await res.json();
    return body.data;
  },

  /**
   * 获取按维度聚合的历史评估（用于折线图）
   */
  async getEvaluationHistoryByDimension(
    sessionId?: string,
    dimension?: string
  ): Promise<Array<{ sessionId: string; createdAt: string; score: number }>> {
    const history = await this.getEvaluationHistory(sessionId, dimension);
    return history.map(item => ({
      sessionId: item.sessionId,
      createdAt: new Date(item.createdAt).toISOString(),
      score: item.score,
    }));
  },
};
```

---

### Task 6: 创建前端四维度评分组件

**标题（TaskCreate）：** `frontend: add EvaluationSummary component`

**描述：** 创建四维度评分卡片组件，用于面试详情页展开展示。

**变更文件：**
- Create: `frontend/src/components/EvaluationSummary.tsx`

**步骤：**

- [ ] **Step 1: 新建 EvaluationSummary component**

```tsx
import React from 'react';

interface Props {
  dimensions: Array<{
    name: 'Communication' | 'Technical Knowledge' | 'Problem Solving' | 'Project Storytelling';
    score: number;
    anchorLabel: string;
    rationale: string;
    evidence: string[]; // 合并的原文片段
    actionItems: Array<{
      title: string;
      difficulty: 'easy' | 'medium' | 'hard';
      exercise: string;
    }>;
  }>;
}

const scoreColor = (s: number): string => {
  if (s >= 90) return 'text-green-600';
  if (s >= 70) return 'text-blue-600';
  if (s >= 50) return 'text-yellow-600';
  if (s >= 30) return 'text-orange-600';
  return 'text-red-600';
};

const dimensionNames: Record<string, string> = {
  Communication: '口头表达',
  'Technical Knowledge': '技术知识',
  'Problem Solving': '问题解决',
  'Project Storytelling': '项目叙述',
};

export const EvaluationSummary: React.FC<Props> = ({ dimensions }) => {
  const overallScore = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;

  return (
    <div className="space-y-4 mt-6">
      {/* Overall Score */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 rounded-xl p-6 text-white">
        <div className="text-center">
          <div className="text-5xl font-bold">{Math.round(overallScore)}</div>
          <div className="text-sm mt-1 opacity-90">综合评分</div>
        </div>
      </div>

      {/* Dimension Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dimensions.map(dim => (
          <div
            key={dim.name}
            className="bg-white dark:bg-slate-800 rounded-lg border p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">
                {dimensionNames[dim.name] || dim.name}
              </h3>
              <span className={`text-2xl font-bold ${scoreColor(dim.score)}`}>
                {dim.score}
              </span>
            </div>
            <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
              {dim.anchorLabel}
            </span>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 line-clamp-3">
              {dim.rationale}
            </p>
            {dim.actionItems.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-medium text-slate-500">提升建议：</span>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  {dim.actionItems[0].exercise}
                </p>
              </div>
            )}
            {dim.evidence.length > 0 && (
              <div className="mt-3">
                <details>
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                    查看证据 ({dim.evidence.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {dim.evidence.map((e, i) => (
                      <li key={i} className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-2 rounded">
                        "{e}"
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

### Task 7: 更新面试详情页

**标题（TaskCreate）：** `frontend: update InterviewDetailPanel`

**描述：** 更新面试详情页，在总得分与总评价的下方显示四维度评分。

**变更文件：**
- Modify: `frontend/src/components/InterviewDetailPanel.tsx`

**步骤：**

- [ ] **Step 1: 导入 EvaluationSummary 并使用**

```tsx
// 在文件顶部添加
import { EvaluationSummary } from './EvaluationSummary';

// 在 ScoreCard 之后添加
{interview.evaluateStatus === 'COMPLETED' && interview.evidenceScores && (
  <EvaluationSummary dimensions={interview.evidenceScores} />
)}
```

---

### Task 8: 创建评估历史折线图页面

**标题（TaskCreate）：** `frontend: add EvaluationHistory page`

**描述：** 创建评估历史页面，展示所有面试的四维度历史折线图（按时间顺序）。

**变更文件：**
- Create: `frontend/src/pages/EvaluationHistoryPage.tsx`
- Modify: `frontend/src/constants/routes.ts` 或 `frontend/src/App.tsx` (注册路由)

**步骤：**

- [ ] **Step 1: 新建 EvaluationHistoryPage component**

```tsx
import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { evaluationApi } from '../api/evaluation';

const DIMENSIONS = [
  { key: 'Communication', label: '口头表达', color: '#8b5cf6' },
  { key: 'Technical Knowledge', label: '技术知识', color: '#3b82f6' },
  { key: 'Problem Solving', label: '问题解决', color: '#10b981' },
  { key: 'Project Storytelling', label: '项目叙述', color: '#f59e0b' },
];

interface PointData {
  sessionId: string;
  createdAt: string;
  Communication?: number;
  'Technical Knowledge'?: number;
  'Problem Solving'?: number;
  'Project Storytelling'?: number;
}

export default function EvaluationHistoryPage() {
  const [data, setData] = useState<PointData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDimension, setSelectedDimension] = useState<string>('Communication');

  useEffect(() => {
    loadHistory();
  }, [selectedDimension]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      // 获取该维度所有记录，按时间排序
      const history = await evaluationApi.getEvaluationHistoryByDimension(undefined, selectedDimension);
      setData(history);
    } catch (err) {
      console.error('加载评估历史失败', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">评估历史</h1>

      {/* Dimension Selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {DIMENSIONS.map(dim => (
          <button
            key={dim.key}
            onClick={() => setSelectedDimension(dim.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedDimension === dim.key
                ? 'bg-primary-500 text-white shadow-md'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-primary-500'
            }`}
          >
            {dim.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        {data.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            暂无该维度的评估数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="sessionId"
                tickFormatter={(val: string) => formatDate(val)}
                label={{ value: '时间', offset: -10, position: 'insideBottom' }}
              />
              <YAxis
                domain={[0, 100]}
                label={{ value: '分数', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                content={({ active, payload, label }) => (
                  <div className="bg-slate-800 text-white p-3 rounded shadow-lg">
                    <p className="text-sm mb-1">{label}</p>
                    {payload?.map((entry: any) => (
                      <p key={entry.name} className="text-sm">
                        {entry.name}: {entry.value}
                      </p>
                    ))}
                  </div>
                )}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey={selectedDimension}
                stroke={DIMENSIONS.find(d => d.key === selectedDimension)?.color || '#3b82f6'}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 注册路由**

```tsx
// 在 frontend/src/App.tsx 中添加
<Route path="/evaluation-history" element={<EvaluationHistoryPage />} />
```

---

### Task 9: 添加评估数据映射到 InterviewDetail

**标题（TaskCreate）：** `backend: add evaluation data to InterviewDetail`

**描述：** 在 InterviewDetailResponse 中添加 evidenceScores 字段，映射 evaluation_scores 表数据。

**变更文件：**
- Modify: `app/src/main/java/interview/guide/modules/interview/model/InterviewDetailResponseDTO.java`
- Modify: `app/src/main/java/interview/guide/modules/interview/service/InterviewDetailService.java`

**步骤：**

- [ ] **Step 1: 添加 evaluationScores 字段**

```java
@Getter
@Setter
public class InterviewDetailResponseDTO {
    // ... 现有字段

    @JsonProperty("evidenceScores")
    private List<EvaluationScoreDTO> evidenceScores;

    // 静态工厂方法或构建器
    public static InterviewDetailResponseDTO fromEntity(InterviewSessionEntity session, List<InterviewAnswerEntity> answers) {
        InterviewDetailResponseDTO dto = new InterviewDetailResponseDTO();
        // ... 映射现有字段
        return dto;
    }
}

@Data
public static class EvaluationScoreDTO {
    private String dimension;
    private Integer score;
    private String anchorLabel;
    private String rationale;
    private List<EvidenceItemDTO> evidence;
    private List<ActionItemDTO> actionItems;
    private String createdAt;
}
```

---

## 三、关键实现细节

### 数据流

1. **面试完成时**：`InterviewSessionService.completeInterview()` 触发异步任务队列
2. **评估触发**：评价服务加载 qa_records + 简历摘要 + referenceContext，调用 LLM
3. **结果持久化**：每维度一条记录写入 `evaluation_scores` 表，evidence 存原文片段
4. **前端展示**：
   - 面试详情页：调用 `/evaluation-details` 显示四维度卡片
   - 历史页：调用 `/evaluation-history` 绘制折线图

### Prompt 输入格式

```
问答记录:
Q: {question}
A: {userAnswer}

[多组问答...]

参考基线:
{referenceContext}

请基于以上问答记录和参考基线，进行四个维度的整体评估...
```

---

## 四、测试方案

### 后端测试

| 测试类 | 关键用例 |
|--------|----------|
| `EvaluationScoreRepositoryTest` | 按 sessionId/维度查询，空结果处理 |
| `EvaluationControllerTest` | 返回评估详情的 JSON 格式验证 |
| 后端集成测试 | 完整评估流程（QA ←→ LLM ←→ EvaluationScoreEntity） |

### 前端测试

| 测试类 | 关键用例 |
|--------|----------|
| `EvaluationSummary.test.tsx` | mock API 返回，验证组件渲染 |
| `EvaluationHistoryPage.test.tsx` | mock 历史 API，验证折线图点击切换 |

### 手动验收

- [ ] 面试完成后自动生成评估（自动触发）
- [ ] 面试详情页展示四维度评分（总分 + 各维度卡片）
- [ ] 面试详情页展开证据片段，可查看原文
- [ ] 评估历史页按时间顺序展示折线图
- [ ] 折线图可切换不同维度
- [ ] 数据持久化正确（每维度一条记录）

---

## 五、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| **LLM 输出格式不合规** | prompt 中强制 JSON schema 要求，服务端严格校验字段；返回 502 并记录 raw 输出供排查 |
| **问答记录过多** | 截断冗长问答，使用摘要而非全文（参考评估基线的处理方式） |
| **评估任务失败** | 失败重试 3 次，超过后记录错误，不影响其他评估任务 |
| **性能问题** | 评估任务是异步的，不阻塞用户体验；批量查询历史时可加缓存 |

---

## 六、数据库变更

### 新建表 evaluation_scores

```sql
CREATE TABLE evaluation_scores (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL,
  dimension VARCHAR(64) NOT NULL,
  score SMALLINT NOT NULL,
  anchor_label VARCHAR(32),
  rationale TEXT,
  evidence JSONB,
  action_items JSONB,
  raw_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_eval_session ON evaluation_scores(session_id);
CREATE INDEX idx_eval_dimension ON evaluation_scores(dimension);
CREATE INDEX idx_eval_created ON evaluation_scores(created_at DESC);
```

---

## 七、变更记录

- 2026-05-31：初始实现计划
  - 基于 qa_records 的四维度评估
  - 历史页折线图展示
  - 面试详情页四维度评分组件
  - 异步评估触发
