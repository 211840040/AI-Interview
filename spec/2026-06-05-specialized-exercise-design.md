# 专项练习模块 — 详细设计文档

## 1. 概述

系统新增专项练习功能，用户可以选择专门的八股知识点领域（如 Java、Agent、数据库等）进行八股问答练习。系统通过大模型随机生成相应领域的问题以及参考答案，用户回答后可查看参考答案。用户可创建自定义题单、收藏系统题目到题单，题单支持练习模式。

## 2. 模块结构

```
app/src/main/java/interview/guide/modules/exercise/
├── ExerciseController.java            # REST 控制器
├── service/
│   ├── ExerciseService.java           # 专项练习核心服务（问题获取、缓存池管理）
│   ├── QuestionGeneratorService.java  # AI 批量问题生成服务
│   └── ExerciseSheetService.java      # 题单 CRUD + 练习模式
├── model/
│   ├── ExerciseQuestionPoolEntity.java   # 问题缓存池实体
│   ├── ExerciseQuestionHistoryEntity.java # 问题获取历史实体
│   ├── ExerciseSheetEntity.java          # 题单实体
│   └── ExerciseSheetQuestionEntity.java  # 题单-问题关联实体
├── dto/
│   ├── ExerciseQuestionDTO.java          # 问题 DTO（返回前端）
│   ├── ExerciseSheetDTO.java             # 题单概要 DTO
│   ├── ExerciseSheetDetailDTO.java       # 题单详情 DTO（含问题列表）
│   ├── CreateSheetRequest.java           # 创建题单请求
│   ├── UpdateSheetRequest.java           # 更新题单请求
│   ├── AddSheetQuestionRequest.java      # 题单添加问题请求
│   └── PracticeResponse.java             # 练习模式返回 DTO
└── repository/
    ├── ExerciseQuestionPoolRepository.java
    ├── ExerciseQuestionHistoryRepository.java
    ├── ExerciseSheetRepository.java
    └── ExerciseSheetQuestionRepository.java
```

## 3. 数据模型

### 3.1 问题缓存池 (exercise_question_pool)

预生成的问题暂存于此，用户请求问题时从此取出，取走后即删除。

```sql
CREATE TABLE exercise_question_pool (
    id BIGSERIAL PRIMARY KEY,
    domain VARCHAR(64)  NOT NULL,         -- 知识点领域，如 java / database / spring
    question TEXT       NOT NULL,          -- 问题内容
    reference_answer TEXT NOT NULL,        -- 参考答案
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**对应 Entity：** `ExerciseQuestionPoolEntity`
- `@Data @Builder @NoArgsConstructor @AllArgsConstructor @Entity`
- `@Table(name = "exercise_question_pool")`
- 字段：id, domain, question, referenceAnswer, createdAt

### 3.2 问题获取历史 (exercise_question_history)

记录用户每次实际获取到的问题，用于 AI 生成时的去重参考。

```sql
CREATE TABLE exercise_question_history (
    id BIGSERIAL PRIMARY KEY,
    domain VARCHAR(64)  NOT NULL,         -- 知识点领域
    question TEXT       NOT NULL,          -- 问题内容
    reference_answer TEXT NOT NULL,        -- 参考答案
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**对应 Entity：** `ExerciseQuestionHistoryEntity`
- `@Data @Builder @NoArgsConstructor @AllArgsConstructor @Entity`
- `@Table(name = "exercise_question_history")`
- 字段：id, domain, question, referenceAnswer, fetchedAt

### 3.3 题单 (exercise_sheet)

用户自定义题单。

```sql
CREATE TABLE exercise_sheet (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255)  NOT NULL,          -- 题单名称
    tags VARCHAR(512),                     -- 逗号分隔的标签
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**对应 Entity：** `ExerciseSheetEntity`
- `@Data @Builder @NoArgsConstructor @AllArgsConstructor @Entity`
- `@Table(name = "exercise_sheet")`
- `@PrePersist` / `@PreUpdate` 自动设置时间
- 字段：id, name, tags, createdAt, updatedAt

### 3.4 题单-问题关联 (exercise_sheet_question)

题单中的自定义问题（直接存储文本，不引用缓存池）。

```sql
CREATE TABLE exercise_sheet_question (
    id BIGSERIAL PRIMARY KEY,
    sheet_id BIGINT NOT NULL REFERENCES exercise_sheet(id) ON DELETE CASCADE,
    question TEXT       NOT NULL,          -- 用户自定义问题
    reference_answer TEXT NOT NULL,        -- 用户自定义答案
    sort_order INT NOT NULL DEFAULT 0,     -- 排序序号
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**对应 Entity：** `ExerciseSheetQuestionEntity`
- `@Data @Builder @NoArgsConstructor @AllArgsConstructor @Entity`
- `@Table(name = "exercise_sheet_question")`
- `@ManyToOne(fetch = LAZY) @JoinColumn(name = "sheet_id")` 关联题单
- 字段：id, sheet, question, referenceAnswer, sortOrder, createdAt

## 4. API 接口设计

所有接口统一前缀 `/api/exercise`，返回 `Result<T>` 包装。

### 4.1 专项练习

#### GET /api/exercise/questions

获取练习题（从缓存池抽取）。

- **请求参数：** `domain` (String, 必填), `count` (Integer, 可选，默认 5)
- **响应：** `Result<List<ExerciseQuestionDTO>>`
- **逻辑：**
  1. 从 `exercise_question_pool` 查 domain 匹配的未取走问题
  2. 够 count 条 → 直接取出，删除记录，写入 History，返回
  3. 不够 count 条 → 查 History 最近 20 条（按 fetched_at DESC），调用 LLM 批量生成补充
  4. 多余的分批存入 Pool，需要的直接返回给用户
  5. 返回的问题写入 History

#### GET /api/exercise/questions/{id}/answer

获取指定问题的参考答案。

- **路径参数：** `id` (Long)
- **响应：** `Result<ExerciseQuestionDTO>`（含 question + referenceAnswer）
- **注意：** 仅查询 History 表（已获取的问题才能看答案）

#### POST /api/exercise/questions/generate

手动触发后台批量生成问题补充缓存池。

- **请求体：** `{ "domain": "java", "count": 10 }`
- **响应：** `Result<Void>`
- **逻辑：** 异步调用 LLM 生成 count 条问题，存入 Pool

### 4.2 收藏

#### POST /api/exercise/questions/{id}/favorite

将系统问题收藏到指定题单。

- **路径参数：** `id` (Long，History 表中的问题 ID)
- **请求参数：** `sheetId` (Long, 必填)
- **响应：** `Result<Void>`
- **逻辑：** 从 History 表查出问题内容，复制到 `exercise_sheet_question`

### 4.3 题单管理

#### GET /api/exercise/sheets

列出所有题单。

- **响应：** `Result<List<ExerciseSheetDTO>>`

#### POST /api/exercise/sheets

创建题单。

- **请求体：** `CreateSheetRequest { name, tags }`
- **响应：** `Result<ExerciseSheetDTO>`

#### GET /api/exercise/sheets/{id}

获取题单详情（含问题列表）。

- **响应：** `Result<ExerciseSheetDetailDTO>`（含 sheet 信息 + List<SheetQuestionDTO>）

#### PUT /api/exercise/sheets/{id}

更新题单信息。

- **请求体：** `UpdateSheetRequest { name, tags }`
- **响应：** `Result<ExerciseSheetDTO>`

#### DELETE /api/exercise/sheets/{id}

删除题单（级联删除关联问题）。

- **响应：** `Result<Void>`

#### POST /api/exercise/sheets/{id}/questions

题单内自定义添加问题。

- **请求体：** `AddSheetQuestionRequest { question, referenceAnswer }`
- **响应：** `Result<SheetQuestionDTO>`
- **注意：** 支持批量添加（请求体可以是数组）

#### DELETE /api/exercise/sheets/{id}/questions/{questionId}

删除题单内指定问题。

- **响应：** `Result<Void>`

### 4.4 练习模式

#### POST /api/exercise/sheets/{id}/practice

从题单中抽取问题进行练习。

- **请求参数：** `count` (Integer, 可选，默认全部)
- **响应：** `Result<List<ExerciseQuestionDTO>>`
- **逻辑：** 从 `exercise_sheet_question` 中按 sort_order 顺序或随机抽取
- **返回结构** 与 GET /api/exercise/questions 一致（前端复用同一页面）

## 5. 核心流程

### 5.1 AI 问题生成

**Prompt 模板位置：** `resources/prompts/exercise/generate-questions.st`

**Prompt 策略：**
1. 加载 `skills/_shared/references/{domain}.md` 作为知识上下文
2. 查询 History 表最近 20 条问题（按 fetched_at DESC），附在 prompt 中作为"近期已出现问题"
3. 要求 LLM 生成的问题与近期问题不重复
4. 要求返回 JSON 数组 `[{question, referenceAnswer}, ...]`
5. 每批生成 10 条（可配置）

**Service：** `QuestionGeneratorService`
- `generateQuestions(String domain, int count, List<String> recentQuestions)`
- 使用 `LlmProviderRegistry.getChatClientOrDefault(provider)` 调用 LLM
- 使用 `StructuredOutputInvoker` 做重试包装
- 解析返回的 JSON 数组

### 5.2 缓存池管理

**Service：** `ExerciseService`

- `fetchQuestions(String domain, int count)` — 获取问题的主入口
- `ensurePool(String domain)` — 池中不足时触发补充
- `refillPool(String domain)` — 调用 QuestionGeneratorService 生成并存入 Pool
- 缓存池总量低于 20 条时，通过 `@Async` 方法后台自动补充

### 5.3 题单练习

**Service：** `ExerciseSheetService`

- `practiceFromSheet(Long sheetId, int count)` — 从题单抽取问题
- 抽取方式：按 sort_order 顺序取前 count 条；count 为 0 或 null 时返回全部
- 返回结构与专项练习一致（ExerciseQuestionDTO）

## 6. 错误码

在 `ErrorCode` 中新增 `12xxx` 域：

```java
EXERCISE_QUESTION_NOT_FOUND(12001, "练习题不存在"),
EXERCISE_SHEET_NOT_FOUND(12002, "题单不存在"),
EXERCISE_QUESTION_GENERATION_FAILED(12003, "问题 AI 生成失败"),
EXERCISE_INSUFFICIENT_QUESTIONS(12004, "题单问题数量不足"),
EXERCISE_POOL_EMPTY(12005, "问题缓存池为空"),
```

## 7. 与现有组件的复用

- `Result<T>` — 统一响应包装
- `BusinessException` + `ErrorCode` — 业务异常
- `LlmProviderRegistry` — 多 LLM Provider 路由
- `StructuredOutputInvoker` — 结构化输出重试
- `skills/_shared/references/*.md` — 知识点领域文档
- 项目约定的 Entity/DTO/Request 命名规范

不修改任何已有代码，完全新建模块。
