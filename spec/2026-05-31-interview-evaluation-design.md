# Interview Evaluation Design

Date: 2026-05-31
Author: Claude Code

Purpose
-------
This document describes the design for an LLM-driven automated interview evaluation feature targeted at job-seekers. The evaluation runs after a completed mock interview session and consumes the textual transcript of the session as input. It scores four dimensions: Communication, Technical Knowledge, Problem Solving, and Project Storytelling, returning structured JSON with scores, rationales, evidence snippets, and action items.

Scope
-----
- Input: text transcript (from ASR or typed answers) representing the full interview session
- No code execution or coding questions are evaluated
- No confidence/uncertainty indicator required in the UI
- The evaluation is performed after interview completion (batch, not streaming)
- MVP: synchronous evaluation API that returns structured JSON and persists records for history

Design Principles
-----------------
- LLM-first: use StructuredOutputInvoker to ask LLM to return a strict JSON according to schema
- Be conservative about hallucinations: require the LLM to cite transcript snippets in rationale
- Keep the MVP implementation minimal and feasible: synchronous evaluate endpoint, persist to DB, front-end summary and history charts

Dimensions and 5-anchor rubrics
-------------------------------
Each dimension is scored 0-100. Anchors are: Excellent (90-100), Good (70-89), Fair (50-69), Poor (30-49), Unintelligible (0-29).

Communication
- Excellent (90-100): Structured, concise, clear conclusions, minimal filler or long pauses
- Good (70-89): Generally clear, minor fillers or repetitions
- Fair (50-69): Structure/logic needs tightening, noticeable repetition or digression
- Poor (30-49): Frequent long pauses, fillers; hard to follow
- Unintelligible (0-29): Fails to answer or incomprehensible

Technical Knowledge
- Excellent (90-100): Accurate concepts, clear explanations, examples where appropriate
- Good (70-89): Concepts correct with minor omissions
- Fair (50-69): Some inaccuracies or vagueness
- Poor (30-49): Incorrect or very shallow understanding
- Unintelligible (0-29): No relevant technical content

Problem Solving
- Excellent (90-100): Clear decomposition, edge cases, complexity awareness, trade-offs
- Good (70-89): Reasonable approach, minor missing pieces
- Fair (50-69): Approach fragmented or misses important boundaries
- Poor (30-49): No clear approach or logical errors
- Unintelligible (0-29): Does not attempt

Project Storytelling
- Excellent (90-100): Clearly states role, responsibility, challenges, metrics/outcomes
- Good (70-89): Clear but lacks some quantification or impact details
- Fair (50-69): Vague on contribution or outcomes
- Poor (30-49): Hard to tell contributor role or impact
- Unintelligible (0-29): No project narrative

StructuredOutput JSON Schema
----------------------------
```json
{
  "overallScore": 0,
  "dimensions": [
    {
      "name": "Communication",
      "score": 0,
      "anchorLabel": "Good",
      "rationale": "...",
      "evidence": [{"startToken": 123, "endToken": 150, "text": "..."}],
      "actionItems": [{"title": "30s elevator pitch", "difficulty": "easy", "exercise": "Summarize your project in 30 seconds."}]
    }
  ],
  "raw": {}
}
```
- LLM must include at least one evidence snippet per evaluated dimension; evidence refers to transcript token indices or text spans.

Prompts
-------
- System prompt: define role as an interview evaluator, include the rubric anchors, require strict JSON output, require evidence snippets.
- User prompt: attach the full transcript and a short candidate profile (optional role/target).
- Use StructuredOutputInvoker to enforce JSON schema.

Persistence
-----------
- New JPA entity: EvaluationScoreEntity (id, sessionId, userId, dimension, score, rationale, evidenceJson, actionItemsJson, rawJson, createdAt)
- Persist all dimension entries and an overall summary record.
- Add mapping in InterviewMapper and include Evaluation summary in InterviewReportDTO.

API
---
- POST /api/interview/{sessionId}/evaluate
  - Behavior: synchronous call that builds prompt with transcript, invokes StructuredOutputInvoker, parses JSON, persists dimension records, returns JSON
- GET  /api/users/{userId}/evaluations?dimension=Communication
  - Returns historical time series for charting

Frontend
--------
- Session end screen: overall score + four dimension cards with score and top action item; "查看证据" opens transcript highlight (no confidence shown)
- History screen: selectable dimension line chart with points for each session; clicking a point shows the evaluation rationale and evidence snippets
- One-click "生成练习" from actionItems to create a queued practice session (future work)

MVP Implementation Plan
-----------------------
1. Add prompts to resources/prompts/interview-evaluation-*.st
2. Implement EvaluationScoreEntity + repository + mapper
3. Implement UnifiedEvaluationService.evaluate(sessionId) to call StructuredOutputInvoker
4. Implement POST /evaluate endpoint in InterviewController delegating to InterviewSessionService
5. Frontend: EvaluationSummary component + EvaluationHistory view
6. Manual local testing with sample transcripts

Open decisions / future improvements
-----------------------------------
- Consider hybrid rule-checks for technical correctness in future
- Add confidence / calibration metrics if accuracy concerns arise

Change log
----------
- 2026-05-31: Initial design, LLM-first, four dimensions, batch evaluation after session

