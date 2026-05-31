# 面试评估（LLM 自动评分）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有模拟面试系统上实现一个 LLM-first 的批次面试评估功能（在面试结束后对完整 transcript 打分并返回结构化结果），首版评估维度为：口头表达、技术知识、问题解决、项目叙述。MVP 为同步 API，前端展示 summary 与历史曲线，不展示置信度字段。

**Architecture:** 后端新增评估服务调用 StructuredOutputInvoker 请求 LLM 返回严格 JSON；解析后持久化到新表 evaluation_scores；前端在会话结束调用评估 API，展示 summary，并在历史页展示折线图。

**Tech Stack:** Java 21, Spring Boot 4, JPA, PostgreSQL (JSONB), React + TypeScript (Vite), Recharts（折线图）, JUnit5 + Mockito。

---

## 一、概要

- **目标：** 实现一个在面试结束后基于完整文字化 transcript 的自动评估功能，LLM 返回结构化 JSON（不含置信度字段），包含四个维度分数、理由、证据片段与提升建议，持久化以支持历史曲线展示与回顾。
- **限制条件：** LLM-first、四维度（Communication, Technical Knowledge, Problem Solving, Project Storytelling）、批次评估（面试结束后触发）、不在 UI 显示置信度、输入为文字化 transcript、MVP 为同步接口。

---

## 二、MVP 任务清单（按优先级排序）

### Task 1: 编写 Prompt 模板

**标题（TaskCreate）：** `write: prompts/interview-evaluation`

**描述：** 把机器可读 rubric 与 JSON schema 嵌入 resources prompts，保证 StructuredOutputInvoker 能强制返回 JSON。

**变更文件：**
- Create/Update: `app/src/main/resources/prompts/interview-evaluation-system.st`
- Create/Update: `app/src/main/resources/prompts/interview-evaluation-user.st`

**步骤：**

- [ ] **Step 1: 创建 system prompt**

在 `app/src/main/resources/prompts/interview-evaluation-system.st` 写入：
```
你是一名专业的面试评估员。你需要根据面试的文字化记录（transcript），对候选人的表现进行多维度评分。请严格按以下规则输出 JSON，不要添加任何额外文字或解释。

评分维度与锚点（0-100 分）：
1. 口头表达 (Communication)：
   - 90-100 Excellent: 结构清晰、表达简洁、有明确结论，几乎无填充词或长停顿。
   - 70-89 Good: 总体清晰，有少量填充词或轻微重复。
   - 50-69 Fair: 结构或逻辑不够紧凑，存在明显重复或离题。
   - 30-49 Poor: 频繁停顿/填充词，难以抓住要点。
   - 0-29 Unintelligible: 回答无法理解或未作答。

2. 技术知识 (Technical Knowledge)：
   - 90-100 Excellent: 概念准确、能解释原理并举例。
   - 70-89 Good: 概念正确但深度或例子不足。
   - 50-69 Fair: 有模糊或部分不准确的表述。
   - 30-49 Poor: 明显错误或非常浅薄。
   - 0-29 Unintelligible: 无相关技术内容。

3. 问题解决 (Problem Solving)：
   - 90-100 Excellent: 思路分解清晰、考虑边界与 trade-offs、复杂度意识强。
   - 70-89 Good: 方法合理、部分细节欠缺。
   - 50-69 Fair: 思路零散或遗漏重要边界。
   - 30-49 Poor: 无清晰方法或逻辑错误。
   - 0-29 Unintelligible: 未尝试或无法判断。

4. 项目叙述 (Project Storytelling)：
   - 90-100 Excellent: 明确职责与贡献、说明挑战并量化结果/影响。
   - 70-89 Good: 描述清楚但缺乏量化指标或影响细节。
   - 50-69 Fair: 对贡献或结果表述含糊。
   - 30-49 Poor: 难以判断贡献或影响。
   - 0-29 Unintelligible: 无项目叙述。

输出要求：
- 每个被评维度必须至少引用 1 个 transcript 原文片段作为 evidence。
- rationale 必须基于 evidence 进行解释，不可凭空评价。
- 若某维度在 transcript 中缺乏足够信息，请将 score 设为 0 并标注 anchorLabel="Insufficient Data"。
- 每个维度给出 2-3 个可操作的提升建议 (actionItems)。
```

- [ ] **Step 2: 创建 user prompt**

在 `app/src/main/resources/prompts/interview-evaluation-user.st` 写入：
```
以下是候选人面试的完整文字化记录（transcript）。候选人目标岗位：{targetRole}。

面试问题列表：
{questions}

面试文字记录：
{transcript}

请严格按照系统指令中定义的评分规则和 JSON 格式输出评估结果。
```

- [ ] **Step 3: 本地验证 prompt 格式**

使用 sample transcript 手工调用 StructuredOutputInvoker 或小脚本，验证 LLM 返回的 JSON 包含四个维度且每个维度都有 evidence 和 actionItems。

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

import java.time.Instant;
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

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "dimension", nullable = false, length = 64)
    private String dimension;

    @Column(name = "score", nullable = false)
    private Integer score;

    @Column(name = "anchor_label", length = 32)
    private String anchorLabel;

    @Column(name = "rationale", columnDefinition = "TEXT")
    private String rationale;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "evidence", columnDefinition = "jsonb")
    private String evidence;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "action_items", columnDefinition = "jsonb")
    private String actionItems;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_json", columnDefinition = "jsonb")
    private String rawJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
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

    List<EvaluationScoreEntity> findByUserIdAndDimensionOrderByCreatedAtAsc(
            Long userId, String dimension);
}
```

- [ ] **Step 3: 验证 repository 可正常使用**

编写简单的单元测试，使用 `@DataJpaTest` + H2 验证 `save()` 和 `findBySessionId()` 方法可用。

---

### Task 3: 实现 InterviewEvaluationService

**标题（TaskCreate）：** `impl: InterviewEvaluationService evaluate & persist`

**描述：** 实现服务，构建 prompt（含 transcript）、调用 StructuredOutputInvoker, 解析返回 JSON，写入 evaluation_scores 表。

**变更文件：**
- Create: `app/src/main/java/interview/guide/modules/interview/service/InterviewEvaluationService.java`
- Create: `app/src/test/java/interview/guide/modules/interview/service/InterviewEvaluationServiceTest.java`

**步骤：**

- [ ] **Step 1: 实现 InterviewEvaluationService**

```java
package interview.guide.modules.interview.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import interview.guide.common.ai.StructuredOutputInvoker;
import interview.guide.modules.interview.model.EvaluationScoreEntity;
import interview.guide.modules.interview.repository.EvaluationScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class InterviewEvaluationService {

    private final StructuredOutputInvoker structuredOutputInvoker;
    private final EvaluationScoreRepository evaluationScoreRepository;
    private final ObjectMapper objectMapper;
    private final ChatClient.Builder chatClientBuilder;

    public String evaluate(Long sessionId, Long userId, String transcript,
                           String questions, String targetRole) {
        // 1. 构建 prompt（使用 StringTemplate 或直接字符串）
        String systemPrompt = loadPrompt("interview-evaluation-system");
        String userPrompt = loadPrompt("interview-evaluation-user")
                .replace("{transcript}", transcript)
                .replace("{questions}", questions)
                .replace("{targetRole}", targetRole != null ? targetRole : "未指定");

        // 2. 调用 StructuredOutputInvoker
        ChatClient chatClient = chatClientBuilder.build();
        String resultJson = structuredOutputInvoker.invokeStructuredOutput(
                systemPrompt + "\n\n" + userPrompt, chatClient, null);

        // 3. 解析 JSON
        try {
            JsonNode root = objectMapper.readTree(resultJson);
            int overallScore = root.get("overallScore").asInt();
            JsonNode dimensions = root.get("dimensions");

            List<EvaluationScoreEntity> entities = new ArrayList<>();
            Instant now = Instant.now();

            if (dimensions != null && dimensions.isArray()) {
                for (JsonNode dim : dimensions) {
                    EvaluationScoreEntity entity = EvaluationScoreEntity.builder()
                            .sessionId(sessionId)
                            .userId(userId)
                            .dimension(dim.get("name").asText())
                            .score(dim.get("score").asInt())
                            .anchorLabel(dim.has("anchorLabel") 
                                    ? dim.get("anchorLabel").asText() : null)
                            .rationale(dim.has("rationale") 
                                    ? dim.get("rationale").asText() : null)
                            .evidence(dim.has("evidence") 
                                    ? dim.get("evidence").toString() : null)
                            .actionItems(dim.has("actionItems") 
                                    ? dim.get("actionItems").toString() : null)
                            .rawJson(resultJson)
                            .createdAt(now)
                            .build();
                    entities.add(entity);
                }
            }

            evaluationScoreRepository.saveAll(entities);
            log.info("Evaluation saved: sessionId={}, dimensions={}", sessionId, entities.size());
            return resultJson;

        } catch (Exception e) {
            log.error("Failed to parse evaluation JSON: sessionId={}, raw={}", sessionId, resultJson, e);
            throw new RuntimeException("Evaluation parse failed: " + e.getMessage());
        }
    }

    private String loadPrompt(String name) {
        // 从 classpath 读取 prompts/interview-evaluation-{name}.st
        // 可使用 Spring 的 ResourceLoader 或 ClassPathResource
        try {
            var resource = new org.springframework.core.io.ClassPathResource(
                    "prompts/" + name + ".st");
            return new String(resource.getInputStream().readAllBytes());
        } catch (Exception e) {
            throw new RuntimeException("Failed to load prompt: " + name, e);
        }
    }
}
```

- [ ] **Step 2: 编写单元测试**

```java
package interview.guide.modules.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import interview.guide.common.ai.StructuredOutputInvoker;
import interview.guide.modules.interview.repository.EvaluationScoreRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.chat.client.ChatClient;

@ExtendWith(MockitoExtension.class)
class InterviewEvaluationServiceTest {

    @Mock StructuredOutputInvoker structuredOutputInvoker;
    @Mock EvaluationScoreRepository evaluationScoreRepository;
    @Mock ChatClient.Builder chatClientBuilder;
    @Mock ChatClient chatClient;

    ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks InterviewEvaluationService service;

    @Test
    @DisplayName("解析合法 JSON 后应持久化四个维度记录")
    void shouldPersistFourDimensionsWhenValidJsonReturned() throws Exception {
        String validJson = """
            {
              "overallScore": 78,
              "dimensions": [
                {"name":"Communication","score":80,"anchorLabel":"Good",
                 "rationale":"表达清晰","evidence":[{"text":"..."}],
                 "actionItems":[{"title":"练习","difficulty":"easy","exercise":"..."}]},
                {"name":"Technical Knowledge","score":75,"anchorLabel":"Good",
                 "rationale":"概念正确","evidence":[{"text":"..."}],
                 "actionItems":[{"title":"复习","difficulty":"medium","exercise":"..."}]},
                {"name":"Problem Solving","score":70,"anchorLabel":"Good",
                 "rationale":"思路合理","evidence":[{"text":"..."}],
                 "actionItems":[{"title":"拆解","difficulty":"medium","exercise":"..."}]},
                {"name":"Project Storytelling","score":85,"anchorLabel":"Good",
                 "rationale":"描述详细","evidence":[{"text":"..."}],
                 "actionItems":[{"title":"量化","difficulty":"easy","exercise":"..."}]}
              ]
            }""";

        when(chatClientBuilder.build()).thenReturn(chatClient);
        when(structuredOutputInvoker.invokeStructuredOutput(any(), any(), any()))
                .thenReturn(validJson);

        String result = service.evaluate(1L, 100L, "transcript...", "Q1...", "Java开发");

        verify(evaluationScoreRepository, times(1)).saveAll(any());
        assertThat(result).contains("Communication");
    }
}
```

- [ ] **Step 3: 运行测试验证通过**

```
./gradlew test --tests "InterviewEvaluationServiceTest"
```

---

### Task 4: 新增 Controller evaluate 端点

**标题（TaskCreate）：** `api: add evaluate endpoint`

**描述：** 在 InterviewController 中新增同步评估接口 POST `/api/interview/{sessionId}/evaluate`，触发 InterviewEvaluationService 并返回结果。

**变更文件：**
- Modify: `app/src/main/java/interview/guide/modules/interview/InterviewController.java`
- Modify: `app/src/main/java/interview/guide/modules/interview/model/InterviewReportDTO.java` (可选，增加 evaluation 字段)
- Modify: `app/src/main/java/interview/guide/modules/interview/service/InterviewSessionService.java` (如评估触发入口在此)

**步骤：**

- [ ] **Step 1: 在 InterviewController 添加评估端点**

```java
@PostMapping("/{sessionId}/evaluate")
public ResponseEntity<Result<String>> evaluateInterview(@PathVariable Long sessionId) {
    // 1. 从 session 中获取 transcript
    InterviewSessionEntity session = interviewSessionService.getSession(sessionId);

    if (session.getTranscript() == null || session.getTranscript().isBlank()) {
        return ResponseEntity.badRequest()
                .body(Result.error(3001, "Transcript 为空，无法评估"));
    }

    // 2. 调用评估服务
    String evaluationJson = interviewEvaluationService.evaluate(
            sessionId,
            session.getUserId(),
            session.getTranscript(),
            session.getQuestions(),   // 或从 DB 按需获取
            session.getTargetRole()   // 可为 null
    );

    return ResponseEntity.ok(Result.success(evaluationJson));
}
```

- [ ] **Step 2: 注入 InterviewEvaluationService 依赖**

在 InterviewController 中添加：
```java
private final InterviewEvaluationService interviewEvaluationService;
```

- [ ] **Step 3: 本地启动验证端点**

启动服务，用 curl 或 Postman 调用：
```
curl -X POST http://localhost:8080/api/interview/1/evaluate
```
预期返回 200 + 包含四个维度的 JSON。

---

### Task 5: 边界条件与错误处理

**标题（TaskCreate）：** `hardening: parse errors & empty transcript`

**描述：** 完善空 transcript、LLM 返回格式错误等边界逻辑。

**变更文件：**
- Modify: `app/src/main/java/interview/guide/modules/interview/service/InterviewEvaluationService.java`

**步骤：**

- [ ] **Step 1: 增加 transcript 前置校验**

在 `evaluate()` 方法开头增加：
```java
if (transcript == null || transcript.isBlank()) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, "Transcript 为空，无法评估");
}
```

- [ ] **Step 2: 改进 JSON 解析异常处理**

将 catch 块中的 `RuntimeException` 改为 `BusinessException`：
```java
catch (Exception e) {
    log.error("Failed to parse evaluation JSON: sessionId={}, raw={}", sessionId, resultJson, e);
    throw new BusinessException(ErrorCode.AI_SERVICE_TIMEOUT,
            "LLM 返回格式异常，评估失败");
}
```

- [ ] **Step 3: 增加维度缺失 evidence 的日志告警**

在解析每个维度后增加：
```java
if (dim.has("evidence") && dim.get("evidence").size() == 0) {
    log.warn("Dimension {} missing evidence: sessionId={}", 
            dim.get("name").asText(), sessionId);
}
```

- [ ] **Step 4: 编写边界测试用例**

- 空 transcript → 抛出 BusinessException
- LLM 返回非 JSON 字符串 → 抛出 BusinessException
- LLM 返回缺少 dimensions 字段 → 抛出 BusinessException

---

### Task 6: 前端 — 会话结束页展示评估结果

**标题（TaskCreate）：** `frontend: add EvaluationSummary component`

**描述：** 在面试会话结束页调用评估 API，展示 overall score + 四维度卡片。

**变更文件：**
- Create: `frontend/src/components/EvaluationSummary.tsx`
- Create: `frontend/src/components/EvaluationCard.tsx`
- Create/Modify: `frontend/src/api/evaluation.ts`
- Modify: 会话结束页（如 `frontend/src/pages/InterviewResultPage.tsx` 或 App.tsx 路由）
- Modify: `frontend/src/utils/score.ts`

**步骤：**

- [ ] **Step 1: 新增 evaluation API 客户端**

`frontend/src/api/evaluation.ts`:
```typescript
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface ActionItem {
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  exercise: string;
}

export interface EvidenceItem {
  startToken: number;
  endToken: number;
  text: string;
}

export interface DimensionScore {
  name: string;
  score: number;
  anchorLabel: string;
  rationale: string;
  evidence: EvidenceItem[];
  actionItems: ActionItem[];
}

export interface EvaluationResult {
  overallScore: number;
  dimensions: DimensionScore[];
  raw?: Record<string, unknown>;
}

export async function evaluateInterview(sessionId: number): Promise<EvaluationResult> {
  const res = await fetch(`${API_BASE}/interview/${sessionId}/evaluate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || '评估失败');
  }
  const body = await res.json();
  return body.data; // Result<T> 包装
}

export async function fetchEvaluationHistory(
  userId: number,
  dimension: string,
  limit = 50
): Promise<Array<{ sessionId: number; date: string; score: number }>> {
  const params = new URLSearchParams({ dimension, limit: String(limit) });
  const res = await fetch(`${API_BASE}/users/${userId}/evaluations?${params}`);
  if (!res.ok) throw new Error('获取历史评估失败');
  const body = await res.json();
  return body.data;
}
```

- [ ] **Step 2: 新增 EvaluationCard 组件**

`frontend/src/components/EvaluationCard.tsx`:
```tsx
import React from 'react';
import type { DimensionScore } from '../api/evaluation';

interface Props {
  dimension: DimensionScore;
  onViewEvidence?: () => void;
}

const scoreColor = (s: number): string => {
  if (s >= 90) return 'text-green-600';
  if (s >= 70) return 'text-blue-600';
  if (s >= 50) return 'text-yellow-600';
  if (s >= 30) return 'text-orange-600';
  return 'text-red-600';
};

export const EvaluationCard: React.FC<Props> = ({ dimension, onViewEvidence }) => (
  <div className="rounded-lg border p-4 shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-semibold text-lg">{dimension.name}</h3>
      <span className={`text-2xl font-bold ${scoreColor(dimension.score)}`}>
        {dimension.score}
      </span>
    </div>
    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
      {dimension.anchorLabel}
    </span>
    <p className="mt-2 text-sm text-gray-700 line-clamp-3">{dimension.rationale}</p>
    {dimension.actionItems.length > 0 && (
      <div className="mt-2">
        <span className="text-xs font-medium text-gray-500">提升建议</span>
        <p className="text-sm text-blue-700">{dimension.actionItems[0].exercise}</p>
      </div>
    )}
    {onViewEvidence && (
      <button
        onClick={onViewEvidence}
        className="mt-3 text-xs text-blue-600 hover:underline"
      >
        查看证据 →
      </button>
    )}
  </div>
);
```

- [ ] **Step 3: 新增 EvaluationSummary 组件**

`frontend/src/components/EvaluationSummary.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { evaluateInterview, type EvaluationResult } from '../api/evaluation';
import { EvaluationCard } from './EvaluationCard';

interface Props {
  sessionId: number;
  transcript?: string; // 用于证据弹窗高亮
}

export const EvaluationSummary: React.FC<Props> = ({ sessionId, transcript }) => {
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);

  useEffect(() => {
    evaluateInterview(sessionId)
      .then(setResult)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <div className="text-center py-8">评估生成中...</div>;
  if (error) return <div className="text-red-600 py-4">评估失败：{error}</div>;
  if (!result) return null;

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Overall Score */}
      <div className="text-center mb-8">
        <div className="text-5xl font-bold text-blue-700">{result.overallScore}</div>
        <div className="text-gray-500 mt-1">综合评分</div>
      </div>

      {/* Dimension Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {result.dimensions.map(dim => (
          <EvaluationCard
            key={dim.name}
            dimension={dim}
            onViewEvidence={() => setSelectedEvidence(
              dim.evidence.map(e => e.text).join('\n---\n')
            )}
          />
        ))}
      </div>

      {/* Evidence Modal */}
      {selectedEvidence && transcript && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
             onClick={() => setSelectedEvidence(null)}>
          <div className="bg-white rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto"
               onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">评估证据</h3>
            <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">
              {selectedEvidence}
            </pre>
            <button
              onClick={() => setSelectedEvidence(null)}
              className="mt-4 text-sm text-gray-500 hover:text-gray-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: 集成到会话结束页**

在 `frontend/src/pages/InterviewResultPage.tsx`（或同义页面）中引入 `<EvaluationSummary sessionId={...} transcript={...} />`。

---

### Task 7: 前端 — 历史评估页

**标题（TaskCreate）：** `frontend: add EvaluationHistory page`

**描述：** 实现按维度切换折线图，点击点查看当次 rationale 与证据。

**变更文件：**
- Create: `frontend/src/pages/EvaluationHistory.tsx`
- Modify: `frontend/src/constants/routes.ts` 或 `frontend/src/App.tsx` (注册路由)

**步骤：**

- [ ] **Step 1: 实现 EvaluationHistory 页面**

`frontend/src/pages/EvaluationHistory.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { fetchEvaluationHistory } from '../api/evaluation';

const DIMENSIONS = ['Communication', 'Technical Knowledge', 'Problem Solving', 'Project Storytelling'];
const DIMENSION_LABELS: Record<string, string> = {
  Communication: '口头表达',
  'Technical Knowledge': '技术知识',
  'Problem Solving': '问题解决',
  'Project Storytelling': '项目叙述',
};

interface DataPoint {
  date: string;
  [dim: string]: number | string;
}

export const EvaluationHistory: React.FC = () => {
  const userId = 1; // TODO: 从 auth context 获取
  const [data, setData] = useState<DataPoint[]>([]);
  const [selectedDim, setSelectedDim] = useState(DIMENSIONS[0]);

  useEffect(() => {
    Promise.all(
      DIMENSIONS.map(dim => fetchEvaluationHistory(userId, dim, 100))
    ).then(results => {
      const dateMap = new Map<string, DataPoint>();
      results.forEach((series, i) => {
        const dim = DIMENSIONS[i];
        series.forEach(pt => {
          const date = new Date(pt.date).toLocaleDateString('zh-CN');
          if (!dateMap.has(date)) dateMap.set(date, { date });
          dateMap.get(date)![dim] = pt.score;
        });
      });
      setData(Array.from(dateMap.values()).sort(
        (a, b) => a.date.localeCompare(b.date)
      ));
    });
  }, [userId]);

  return (
    <div className="max-w-4xl mx-auto py-6">
      <h2 className="text-xl font-bold mb-4">评估历史</h2>

      {/* Dimension Selector */}
      <div className="flex gap-2 mb-6">
        {DIMENSIONS.map(dim => (
          <button
            key={dim}
            onClick={() => setSelectedDim(dim)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectedDim === dim
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {DIMENSION_LABELS[dim]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg border p-4" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey={selectedDim}
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 4 }}
              name={DIMENSION_LABELS[selectedDim]}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 注册路由**

在 `frontend/src/App.tsx` 添加：
```tsx
<Route path="/evaluations" element={<EvaluationHistory />} />
```

---

### Task 8: 测试、示例数据与文档

**标题（TaskCreate）：** `test & docs: unit tests + sample transcripts`

**描述：** 补全单元测试与集成测试要点，加入示例 transcript 用于本地调试。

**变更文件：**
- Create: `app/src/test/java/interview/guide/modules/interview/service/InterviewEvaluationServiceTest.java` (Task 3 已包含)
- Create: `app/src/test/java/interview/guide/modules/interview/controller/InterviewControllerEvaluationTest.java`
- Create: `app/src/test/resources/sample-transcripts/transcript-sample.txt`
- Create: `frontend/src/components/__tests__/EvaluationSummary.test.tsx`
- Create: `docs/superpowers/plans/2026-05-31-interview-evaluation-plan.md` (本文件)

**步骤：**

- [ ] **Step 1: Controller 集成测试**

```java
@WebMvcTest(InterviewController.class)
class InterviewControllerEvaluationTest {

    @Autowired MockMvc mockMvc;
    @MockBean InterviewSessionService interviewSessionService;
    @MockBean InterviewEvaluationService interviewEvaluationService;

    @Test
    @DisplayName("transcript 为空时返回 400")
    void shouldReturn400WhenTranscriptEmpty() throws Exception {
        when(interviewSessionService.getSession(1L))
            .thenReturn(InterviewSessionEntity.builder()
                .id(1L).userId(100L).transcript("").build());

        mockMvc.perform(post("/api/interview/1/evaluate"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("正常 transcript 返回 200 并包含评估 JSON")
    void shouldReturn200WhenTranscriptValid() throws Exception {
        when(interviewSessionService.getSession(1L))
            .thenReturn(InterviewSessionEntity.builder()
                .id(1L).userId(100L).transcript("面试内容...").build());
        when(interviewEvaluationService.evaluate(any(), any(), any(), any(), any()))
            .thenReturn("{\"overallScore\":80}");

        mockMvc.perform(post("/api/interview/1/evaluate"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.overallScore").value(80));
    }
}
```

- [ ] **Step 2: 创建示例 transcript**

`app/src/test/resources/sample-transcripts/transcript-sample.txt`:
```
面试官：请简单介绍一下你自己。
候选人：我叫张三，有五年 Java 开发经验...
面试官：请描述一个你解决过的复杂技术问题。
候选人：在项目中我们遇到了...
```

- [ ] **Step 3: 前端组件测试**

```tsx
// frontend/src/components/__tests__/EvaluationSummary.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { EvaluationSummary } from '../EvaluationSummary';
import { vi } from 'vitest';

vi.mock('../../api/evaluation', () => ({
  evaluateInterview: vi.fn().mockResolvedValue({
    overallScore: 78,
    dimensions: [
      {
        name: 'Communication', score: 80, anchorLabel: 'Good',
        rationale: '表达清晰', evidence: [{ text: '...' }],
        actionItems: [{ title: '练习', difficulty: 'easy', exercise: '30s 陈述' }],
      },
      // ...其他三个维度类似
    ],
  }),
}));

test('renders overall score and dimension cards', async () => {
  render(<EvaluationSummary sessionId={1} />);
  await waitFor(() => {
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Communication')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 将本计划文档保存到仓库**

```
git add docs/superpowers/plans/2026-05-31-interview-evaluation-plan.md
```

---

## 三、关键实现细节与修改文件清单

### 后端（Java）新增/修改文件

| 操作 | 文件路径 |
|------|----------|
| **Create** | `app/src/main/resources/prompts/interview-evaluation-system.st` |
| **Create** | `app/src/main/resources/prompts/interview-evaluation-user.st` |
| **Create** | `app/src/main/java/interview/guide/modules/interview/model/EvaluationScoreEntity.java` |
| **Create** | `app/src/main/java/interview/guide/modules/interview/repository/EvaluationScoreRepository.java` |
| **Create** | `app/src/main/java/interview/guide/modules/interview/service/InterviewEvaluationService.java` |
| **Modify** | `app/src/main/java/interview/guide/modules/interview/InterviewController.java` |
| **Modify** | `app/src/main/java/interview/guide/modules/interview/model/InterviewReportDTO.java` (可选) |
| **Create** | `app/src/test/java/interview/guide/modules/interview/service/InterviewEvaluationServiceTest.java` |
| **Create** | `app/src/test/java/interview/guide/modules/interview/controller/InterviewControllerEvaluationTest.java` |
| **Create** | `app/src/test/resources/sample-transcripts/transcript-sample.txt` |

### 前端（React/TS）新增/修改文件

| 操作 | 文件路径 |
|------|----------|
| **Create** | `frontend/src/api/evaluation.ts` |
| **Create** | `frontend/src/components/EvaluationSummary.tsx` |
| **Create** | `frontend/src/components/EvaluationCard.tsx` |
| **Create** | `frontend/src/pages/EvaluationHistory.tsx` |
| **Modify** | `frontend/src/App.tsx` (添加路由) |
| **Modify** | 会话结束页 (添加 `<EvaluationSummary />`) |
| **Create** | `frontend/src/components/__tests__/EvaluationSummary.test.tsx` |

---

## 四、API 合约与 DTO

### POST /api/interview/{sessionId}/evaluate

- **描述：** 触发对已完成面试的评估（从 session 中获取 transcript）
- **请求：**
  - Path: `sessionId` (Long)
  - Body: 无（或可选 `{ "candidateNote": "..." }`）
- **成功响应 200：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "overallScore": 78,
    "dimensions": [
      {
        "name": "Communication",
        "score": 80,
        "anchorLabel": "Good",
        "rationale": "回答结构清晰，但存在少量填充词，证据：\"...片段...\"",
        "evidence": [
          {"startToken": 123, "endToken": 150, "text": "我们在项目中负责..."}
        ],
        "actionItems": [
          {"title": "30s 电梯陈述", "difficulty": "easy", "exercise": "用 30 秒概述项目目标与结果"}
        ]
      }
    ],
    "raw": { }
  }
}
```

- **错误响应：**
  - 400: `{ "code": 1001, "message": "Transcript 为空，无法评估" }`
  - 502: `{ "code": 7002, "message": "LLM 返回格式异常，评估失败" }`

### GET /api/users/{userId}/evaluations?dimension=Communication&limit=50

- **成功响应 200：**

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {"sessionId": 101, "date": "2026-05-30T12:34:00Z", "score": 72},
    {"sessionId": 88,  "date": "2026-04-21T15:00:00Z", "score": 65}
  ]
}
```

---

## 五、数据库变更草案

### 新建表 evaluation_scores

```sql
CREATE TABLE evaluation_scores (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
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
CREATE INDEX idx_eval_user ON evaluation_scores(user_id);
```

- **数据迁移：** 不需要（新表，无历史数据需迁移）
- JPA `ddl-auto` 设为 `update` 时 Entity 可自动建表；或手动执行上述 DDL

---

## 六、测试方案

### 单元测试

| 测试类 | 关键用例 |
|--------|----------|
| `InterviewEvaluationServiceTest` | mock LLM 返回合法 JSON → 断言 persist 正确四个维度 |
| | mock LLM 返回格式错误 → 断言抛 BusinessException |
| `InterviewControllerEvaluationTest` | transcript 为空 → 返回 400 |
| | 正常 transcript → 返回 200 + 包含 dimensions |
| `EvaluationSummary.test.tsx` | mock API 返回 → 断言 UI 显示 overall score 与维度名 |

### 手动验收检查表

- [ ] 给定 sample transcript，POST `/api/interview/{id}/evaluate` 返回四维度 JSON，overallScore 在 0-100 范围内
- [ ] DB 中写入 4 条 evaluation_scores 记录（每维度一条）
- [ ] 会话结束页显示 overall 卡片 + 四张维度卡片，点击"查看证据"弹窗显示 transcript 片段
- [ ] 历史页展示折线图，维度按钮可切换
- [ ] transcript 为空时返回 400 且有中文错误提示
- [ ] LLM 返回异常 JSON 时返回 502 且日志记录原始 payload

---

## 七、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| **LLM 输出格式不合规** | prompt 中强制 JSON schema 要求，服务端严格校验字段；返回 502 并记录 raw 输出供排查 |
| **transcript 质量差（ASR 错误）** | 评估前检查 transcript 长度/内容，不足时返回 400 提示重新录入或文本补录 |
| **LLM 同步调用导致超时** | 设置合理超时（如 30s），超时后返回 504；后续可考虑改为异步队列 + 轮询 |
| **LLM 幻觉评分** | 要求每个评分都有 evidence 引用 transcript 原文，缺失 evidence 的维度在日志中告警 |

---

## 八、数据库迁移说明

- 新增表 `evaluation_scores`，不影响现有表结构
- 使用 JPA `ddl-auto=update` 时 Entity 自动建表（开发环境）
- 生产环境建议手动执行 DDL 或通过 Flyway/Liquibase 管理

---

## 变更记录

- 2026-05-31：初始实现计划，优先级为功能可行性
