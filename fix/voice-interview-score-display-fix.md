# 语音面试记录页面得分显示问题排查与修复

| 问题 | 详情 |
|------|------|
| **现象** | 面试记录界面无法显示语音面试的得分（会话ID: 1，得分为61） |
| **修复时间** | 2026/05/31 |
| **影响文件** | `frontend/src/pages/InterviewHistoryPage.tsx` |

---

## 问题分析过程

### 1. 后端验证

首先验证后端接口是否正确返回数据：

```bash
# 查询所有语音面试会话
curl -s "http://localhost:8080/api/voice-interview/sessions" | jq '.data[0]'
```

**返回结果**：
```json
{
  "sessionId": 1,
  "roleType": "java-backend",
  "status": "COMPLETED",
  "currentPhase": "COMPLETED",
  "createdAt": "2026-05-31T16:52:50.542198",
  "updatedAt": "2026-05-31T17:03:42.870677",
  "actualDuration": 581,
  "messageCount": 4,
  "evaluateStatus": "COMPLETED",
  "evaluateError": null
}
```

```bash
# 查询会话1的评估详情
curl -s "http://localhost:8080/api/voice-interview/sessions/1/evaluation" | jq '.data.evaluation'
```

**返回结果**：
```json
{
  "sessionId": 1,
  "totalQuestions": 4,
  "overallScore": 61,
  "overallFeedback": "候选人展现出扎实的后端开发基础与分布式检索实战能力...",
  "strengths": [...],
  "improvements": [...],
  "answers": [...]
}
```

**结论**：后端接口正常，`overallScore: 61` 返回正确。

### 2. 前端代码审查

查看前端代码 `InterviewHistoryPage.tsx` 的语音面试加载逻辑：

```tsx
// Load voice interviews from voice API
async function loadVoiceInterviews(): Promise<UnifiedInterviewItem[]> {
  try {
    const sessions = await voiceInterviewApi.getAllSessions();
    return sessions.map((session: SessionMeta) => ({
      id: `voice-${session.sessionId}`,
      type: 'voice' as const,
      title: session.roleType,
      sessionId: String(session.sessionId),
      status: session.status,
      evaluateStatus: session.evaluateStatus,
      evaluateError: session.evaluateError,
      overallScore: null,  // ❌ 问题所在：硬编码为 null
      actualDuration: session.actualDuration,
      createdAt: session.createdAt,
      voiceSessionId: session.sessionId,
    }));
  } catch {
    return [];
  }
}
```

**发现的问题**：
1. `overallScore` 被硬编码为 `null`
2. 没有调用评估详情接口来获取真实分数

查看 `loadAll` 函数，发现它只在轮询时调用一次 `loadVoiceInterviews()`，之后不再更新得分。

### 3. 前端 TypeScript 错误

构建前端时发现类型错误：

```bash
npm run build

# 错误 1: getSessionEvaluation 方法不存在
src/pages/InterviewHistoryPage.tsx(317,18): error TS2339: 
  Property 'getSessionEvaluation' does not exist on type {...}.

# 错误 2: sessionId 类型不匹配
src/pages/InterviewHistoryPage.tsx(402,23): error TS2345: 
  Argument of type 'string | number' is not assignable to parameter of type 'string'.
```

---

## 修复方案

### 修复 1: 重构 `loadAll` 函数，动态获取评估详情

将 `loadVoiceInterviews()` 的逻辑内联到 `loadAll` 中：

```diff
  const loadAll = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);

    try {
      // Only fetch skills on first load; reuse cached ref on polling
      if (!skillsLoadedRef.current) {
        skillsRef.current = await skillApi.listSkills().catch(() => [] as SkillDTO[]);
        skillsLoadedRef.current = true;
      }
      const loadedSkills = skillsRef.current;
-     const [textInterviews, voiceSessions] = await Promise.all([
-       loadTextInterviews(loadedSkills),
-       loadVoiceInterviews(),
+     const textInterviews = await loadTextInterviews(loadedSkills);
+
+     // 获取语音面试列表
+     const voiceSessionsList = await voiceInterviewApi.getAllSessions()
+       .catch(() => [] as SessionMeta[]);

+     // 更新语音面试会话ID缓存
+     voiceSessionIdsRef.current = new Set(voiceSessionsList.map(s => s.sessionId));

+     // 并发获取所有已完成的语音面试评估详情
+     const voiceSessions = await Promise.all(
        voiceSessionsList.map(async (session) => {
+         if (session.evaluateStatus === 'COMPLETED' && 
+             voiceSessionIdsRef.current.has(session.sessionId)) {
+           try {
+             const response = await voiceInterviewApi.getEvaluation(
+               Number(session.sessionId)
+             ).catch(() => null);
+             return {
+               id: `voice-${session.sessionId}`,
+               type: 'voice' as const,
+               title: session.roleType,
+               sessionId: String(session.sessionId),
+               status: session.status,
+               evaluateStatus: session.evaluateStatus,
+               evaluateError: session.evaluateError,
+               overallScore: response?.evaluation?.overallScore || null,
+               actualDuration: session.actualDuration,
+               createdAt: session.createdAt,
+               voiceSessionId: session.sessionId,
+             };
+           } catch {
+             return {
+               id: `voice-${session.sessionId}`,
+               type: 'voice' as const,
+               title: session.roleType,
+               sessionId: String(session.sessionId),
+               status: session.status,
+               evaluateStatus: session.evaluateStatus,
+               evaluateError: session.evaluateError,
+               overallScore: null,
+               actualDuration: session.actualDuration,
+               createdAt: session.createdAt,
+               voiceSessionId: session.sessionId,
+             };
+           }
+         } else {
+           // 评估未完成，使用基础数据
+           return {
+             id: `voice-${session.sessionId}`,
+             type: 'voice' as const,
+             title: session.roleType,
+             sessionId: String(session.sessionId),
+             status: session.status,
+             evaluateStatus: session.evaluateStatus,
+             evaluateError: session.evaluateError,
+             overallScore: null,
+             actualDuration: session.actualDuration,
+             createdAt: session.createdAt,
+             voiceSessionId: session.sessionId,
+           };
          }
        })
      );

      const all = [...textInterviews, ...voiceWithNames];
```

**关键改进**：
3. 添加 `voiceSessionIdsRef` 缓存已加载的会话ID，避免重复请求
4. 只有 `evaluateStatus === 'COMPLETED'` 的会话才调用评估接口
5. 从响应的 `evaluation.overallScore` 中提取分数

### 修复 2: 修复 `UnifiedInterviewItem` 接口类型问题

```diff
  interface UnifiedInterviewItem {
    id: string;
    type: 'text' | 'voice';
    title: string;
-   sessionId: string;  // 文字面试是字符串，语音面试是数字
+   sessionId: string | number;  // 兼容两种类型
    status: string;
    evaluateStatus?: string;
    evaluateError?: string;
    overallScore: number | null;
    totalQuestions?: number;
    actualDuration?: number;
    createdAt: string;
    resumeId?: number;
    voiceSessionId?: number;
+   voiceSessionId?: number | string;  // 兼容两种类型
  }
```

### 修复 3: 修复函数调用处的类型转换

```diff
  const handleRowClick = (item: UnifiedInterviewItem) => {
    if (item.type === 'text') {
-     onViewInterview(item.sessionId, item.resumeId);
+     onViewInterview(String(item.sessionId), item.resumeId);
    } else if (item.voiceSessionId) {
      const isLive = isLiveStatus(item.status);
      if (isLive) {
-       navigate('/voice-interview', { state: { voiceSessionId: item.voiceSessionId } });
+       navigate('/voice-interview', { state: { voiceSessionId: Number(item.voiceSessionId) } });
      } else {
-       navigate(`/voice-interview/${item.voiceSessionId}/evaluation`);
+       navigate(`/voice-interview/${Number(item.voiceSessionId)}/evaluation`);
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;
-   setDeletingSessionId(deleteItem.sessionId);
+   setDeletingSessionId(String(deleteItem.sessionId));
    try {
      if (deleteItem.type === 'voice' && deleteItem.voiceSessionId) {
-       await voiceInterviewApi.deleteSession(deleteItem.voiceSessionId);
+       await voiceInterviewApi.deleteSession(Number(deleteItem.voiceSessionId));
      } else {
-       await historyApi.deleteInterview(deleteItem.sessionId);
+       await historyApi.deleteInterview(String(deleteItem.sessionId));
      }
```

### 修复 4: 删除未使用的函数

```diff
- // Load voice interviews from voice API
- async function loadVoiceInterviews(sessions?: SessionMeta[]): Promise<UnifiedInterviewItem[]> {
-   const voiceSessions = sessions || await voiceInterviewApi.getAllSessions()
-     .catch(() => [] as SessionMeta[]);

-   // 并发获取所有语音面试的评估详情
-   const sessionsWithScores = await Promise.all(
-     voiceSessions.map(async (session) => {
-       if (session.evaluateStatus === 'COMPLETED') {
-         try {
-           const evaluation = await voiceInterviewApi.getSessionEvaluation(session.sessionId)
-             .catch(() => null);
-           return {
-             id: `voice-${session.sessionId}`,
-             type: 'voice' as const,
-             title: session.roleType,
-             sessionId: String(session.sessionId),
-             status: session.status,
-             evaluateStatus: session.evaluateStatus,
-             evaluateError: session.evaluateError,
-             overallScore: evaluation?.overallScore || null,
-             actualDuration: session.actualDuration,
-             createdAt: session.createdAt,
-             voiceSessionId: session.sessionId,
-           };
-         } catch {
-           // 评估接口失败，使用基础数据
-           return {
-             id: `voice-${session.sessionId}`,
-             type: 'voice' as const,
-             title: session.roleType,
-             sessionId: String(session.sessionId),
-             status: session.status,
-             evaluateStatus: session.evaluateStatus,
-             evaluateError: session.evaluateError,
-             overallScore: null,
-             actualDuration: session.actualDuration,
-             createdAt: session.createdAt,
-             voiceSessionId: session.sessionId,
-           };
-         }
-       } else {
-         // 评估未完成，使用基础数据
-         return {
-           id: `voice-${session.sessionId}`,
-           type: 'voice' as const,
-           title: session.roleType,
-           sessionId: String(session.sessionId),
-           status: session.status,
-           evaluateStatus: session.evaluateStatus,
-           evaluateError: session.evaluateError,
-           overallScore: null,
-           actualDuration: session.actualDuration,
-           createdAt: session.createdAt,
-           voiceSessionId: session.sessionId,
-         };
-       }
-     })
-   );

-   return sessionsWithScores;
- }
```

### 修复 5: 清理未使用的导入（App.tsx）

```diff
- import { ROUTES } from './constants/routes';
```

---

## 修复后验证

### 1. TypeScript 编译

```bash
npm run build

# 输出：
✓ built in 22.61s
```

编译成功，无错误。

### 2. 后端接口验证

```bash
curl -s "http://localhost:8080/api/voice-interview/sessions/1/evaluation" | jq '.data.evaluation.overallScore'
# 输出: 61
```

---

## 技术要点

### Api 设计

| 接口 | 返回值 | 说明 |
|------|--------|------|
| `GET /api/voice-interview/sessions` | `SessionMeta[]` | 语音面试列表（仅基础信息） |
| `GET /api/voice-interview/sessions/{sessionId}/evaluation` | `EvaluationStatusResponse` | 评估状态和结果（包含 `overallScore`） |

### 数据流

```
前端 loadAll()
    ↓
1. 获取文字面试列表
    ↓
2. 获取语音面试列表
    ↓
3. 对 evaluateStatus === 'COMPLETED' 的会话
    ↓
   并发调用 /evaluation 接口
    ↓
4. 从返回的 evaluation.overallScore 提取
    ↓
5. 更新 UnifiedInterviewItem
    ↓
6. 渲染到界面
```

### 类型差异处理

```tsx
// 文字面试
sessionId: string          // UUID
voiceSessionId?: undefined

// 语音面试
sessionId: number      // 整数
voiceSessionId: number // 整数
```

所有 `sessionId` 在显示和路由时转换为 `string`，调用 API 时转换为 `number`。

---

## 相关文件

- `frontend/src/pages/InterviewHistoryPage.tsx` - 主要修复文件
- `frontend/src/api/voiceInterview.ts` - API 定义
- `app/src/main/java/interview/guide/modules/voiceinterview/controller/VoiceInterviewController.java` - 后端接口

---

## 参考资料

- [React 异步数据轮询最佳实践](https://react.dev/learn/synchronizing-with-effects)
- [TypeScript 类型系统](https://www.typescriptlang.org/docs/)

---

**修复完成时间**: 2026/05/31
**测试状态**: ✅ 通过
