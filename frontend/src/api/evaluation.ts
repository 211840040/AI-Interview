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
   * 获取按维度聚合的历史评估（用于折线图）
   */
  async getEvaluationHistoryByDimension(
    sessionId?: string,
    dimension?: string
  ): Promise<Array<{ sessionId: string; createdAt: string; score: number }>> {
    const history = await this.getEvaluationHistory(sessionId, dimension);
    return history.map(item => ({
      sessionId: item.dimension,
      createdAt: new Date(item.createdAt).toISOString(),
      score: item.score,
    }));
  },
};
