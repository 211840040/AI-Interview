package interview.guide.modules.interview.model;

import interview.guide.common.evaluation.MultipoleEvaluationService.ActionItemDTO;
import interview.guide.common.evaluation.MultipoleEvaluationService.EvidenceItemDTO;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 面试详情DTO
 */
public record InterviewDetailDTO(
    Long id,
    String sessionId,
    Integer totalQuestions,
    String status,
    String evaluateStatus,
    String evaluateError,
    Integer overallScore,
    String overallFeedback,
    LocalDateTime createdAt,
    LocalDateTime completedAt,
    List<Object> questions,
    List<String> strengths,
    List<String> improvements,
    List<Object> referenceAnswers,
    List<AnswerDetailDTO> answers,
    List<EvaluationScoreDTO> evidenceScores
) {
    public record EvaluationScoreDTO(
        String dimension,
        Integer score,
        String anchorLabel,
        String rationale,
        List<EvidenceItemDTO> evidence,
        List<ActionItemDTO> actionItems,
        String createdAt
    ) {}
    /**
     * 答案详情DTO
     */
    public record AnswerDetailDTO(
        Integer questionIndex,
        String question,
        String category,
        String userAnswer,
        Integer score,
        String feedback,
        String referenceAnswer,
        List<String> keyPoints,
        LocalDateTime answeredAt
    ) {}
}

