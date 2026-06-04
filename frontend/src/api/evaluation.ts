import { request } from './request';

export interface EvidenceItem {
  text: string;
}

export interface ActionItem {
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  exercise: string;
}

export interface DimensionScore {
  dimension: string;
  score: number;
  anchorLabel: string;
  rationale: string;
  evidence: EvidenceItem[];
  actionItems: ActionItem[];
  createdAt: string;
  /** 会话业务ID：文字面试为UUID字符串，语音面试为会话数字ID */
  sessionUuid?: string;
  /** 语音面试的sessionId（Long类型） */
  sessionId?: number;
}

/**
 * 用于趋势折线图的单条维度数据
 */
export interface TrendDataPoint {
  dimension: string;
  score: number;
  createdAt: string;
  sessionId: number;
  /** 精确匹配的面试业务ID：文字面试为UUID字符串，语音面试为sessionId数字 */
  refSessionId?: string;
}

/**
 * 聚合后的趋势数据（按维度分组）
 */
export interface TrendGroup {
  dimension: string;
  dataPoints: TrendDataPoint[];
  averageScore: number;
  latestScore: number;
}

/**
 * 面试历史聚合统计（用于顶部展示）
 */
export interface EvaluationAggregate {
  overallAverageScore: number;
  dimensionAverages: { dimension: string; averageScore: number }[];
  trendGroups: TrendGroup[];
  recentSuggestions: string[];
}

export const evaluationApi = {
  /**
   * 获取指定会话的评估详情（四维度评分）
   */
  async getEvaluationDetails(sessionId: string): Promise<DimensionScore[]> {
    return request.get<DimensionScore[]>(`/api/interview/sessions/${sessionId}/evaluation-details`);
  },

  /**
   * 获取评估历史记录
   */
  async getEvaluationHistory(sessionId?: string, dimension?: string): Promise<DimensionScore[]> {
    const params = new URLSearchParams();
    if (sessionId) params.set('sessionId', sessionId);
    if (dimension) params.set('dimension', dimension);
    const query = params.toString();
    return request.get<DimensionScore[]>(`/api/interview/evaluation-history${query ? `?${query}` : ''}`);
  },

  /**
   * 获取所有文本面试维度评分历史（用于趋势折线图）
   */
  async getAllTextEvaluationHistory(): Promise<DimensionScore[]> {
    return request.get<DimensionScore[]>('/api/interview/evaluation-history/enriched');
  },

  /**
   * 从后端 EvaluationScoreEntity 响应归一化为 DimensionScore
   * （后端返回的字段名可能不同）
   */
  normalizeFromEntity(raw: any): DimensionScore {
    return {
      dimension: raw.dimension,
      score: raw.score,
      anchorLabel: raw.anchorLabel ?? '',
      rationale: raw.rationale ?? '',
      evidence: typeof raw.evidence === 'string'
        ? JSON.parse(raw.evidence)
        : (raw.evidence ?? []),
      actionItems: typeof raw.actionItems === 'string'
        ? JSON.parse(raw.actionItems)
        : (raw.actionItems ?? []),
      createdAt: raw.createdAt,
      sessionUuid: raw.sessionUuid,
      sessionId: raw.sessionId,
    };
  },

  /**
   * 获取语音面试维度评分历史（趋势数据）
   */
  async getVoiceEvaluationHistory(sessionId?: number, dimension?: string): Promise<DimensionScore[]> {
    const params = new URLSearchParams();
    if (sessionId !== undefined) params.set('sessionId', String(sessionId));
    if (dimension) params.set('dimension', dimension);
    const query = params.toString();
    return request.get<DimensionScore[]>(`/api/voice-interview/evaluation-history${query ? `?${query}` : ''}`);
  },

  /**
   * 获取聚合趋势数据（合并文字 + 语音面试）
   * 返回按维度分组的趋势数据，用于前端图表展示
   */
  async getAggregatedTrends(): Promise<EvaluationAggregate> {
    const [textRaw, voiceRaw] = await Promise.all([
      this.getAllTextEvaluationHistory(),
      this.getVoiceEvaluationHistory(),
    ]);

    // 全部评分数据
    const allScores: DimensionScore[] = [
      ...textRaw.map(r => this.normalizeFromEntity(r)),
      ...voiceRaw.map(r => this.normalizeFromEntity(r)),
    ];

    if (allScores.length === 0) {
      return {
        overallAverageScore: 0,
        dimensionAverages: [],
        trendGroups: [],
        recentSuggestions: [],
      };
    }

    // 按维度分组
    const byDimension = new Map<string, DimensionScore[]>();
    for (const s of allScores) {
      const list = byDimension.get(s.dimension) ?? [];
      list.push(s);
      byDimension.set(s.dimension, list);
    }

    const trendGroups: TrendGroup[] = [];
    const dimensionAverages: { dimension: string; averageScore: number }[] = [];
    let overallSum = 0;
    let overallCount = 0;

    for (const [dim, scores] of byDimension) {
      // 按时间排序
      const sorted = [...scores].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const dataPoints: TrendDataPoint[] = sorted.map(s => ({
        dimension: dim,
        score: s.score,
        createdAt: s.createdAt,
        sessionId: s.sessionId ?? 0,
        refSessionId: s.sessionUuid || String(s.sessionId ?? ''),
      }));

      const avg = Math.round(sorted.reduce((sum, s) => sum + s.score, 0) / sorted.length);

      trendGroups.push({
        dimension: dim,
        dataPoints,
        averageScore: avg,
        latestScore: sorted[sorted.length - 1].score,
      });

      dimensionAverages.push({ dimension: dim, averageScore: avg });
      overallSum += sorted.reduce((sum, s) => sum + s.score, 0);
      overallCount += sorted.length;
    }

    const overallAverageScore = Math.round(overallSum / overallCount);

    // 收集最近的建议（取最新一个会话的 actionItems 文本）
    const sortedByRecent = [...allScores].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const recentSuggestions: string[] = [];
    const seenDims = new Set<string>();
    for (const s of sortedByRecent) {
      if (seenDims.has(s.dimension)) continue;
      seenDims.add(s.dimension);
      if (s.actionItems && s.actionItems.length > 0) {
        recentSuggestions.push(s.actionItems[0].exercise);
      }
    }

    return {
      overallAverageScore,
      dimensionAverages,
      trendGroups,
      recentSuggestions: recentSuggestions.slice(0, 4),
    };
  },
};
