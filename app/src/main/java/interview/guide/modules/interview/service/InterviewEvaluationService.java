package interview.guide.modules.interview.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import interview.guide.common.evaluation.MultipoleEvaluationService;
import interview.guide.common.evaluation.MultipoleEvaluationService.DimensionScoreDTO;
import interview.guide.common.evaluation.MultipoleEvaluationService.MultipoleReportDTO;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.interview.model.EvaluationScoreEntity;
import interview.guide.modules.interview.model.InterviewQuestionDTO;
import interview.guide.modules.interview.model.InterviewSessionEntity;
import interview.guide.modules.interview.repository.EvaluationScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class InterviewEvaluationService {

    private final MultipoleEvaluationService multipoleEvaluationService;
    private final EvaluationScoreRepository evaluationScoreRepository;
    private final ObjectMapper objectMapper;

    /**
     * 文字面试多维度评估入口
     */
    public void evaluateSession(ChatClient chatClient,
                                 InterviewSessionEntity session,
                                 String resumeText,
                                 List<InterviewQuestionDTO> questions) {
        MultipoleReportDTO report = multipoleEvaluationService.evaluate(
                chatClient, session.getId(), session.getSkillId(), questions);
        persistScores(session.getId(), report);
    }

    public List<EvaluationScoreEntity> getScoreBySessionId(Long sessionId) {
        return evaluationScoreRepository.findBySessionId(sessionId);
    }

    private void persistScores(Long sessionDbId, MultipoleReportDTO report) {
        LocalDateTime now = LocalDateTime.now();
        for (DimensionScoreDTO dim : report.dimensions()) {
            EvaluationScoreEntity entity = EvaluationScoreEntity.builder()
                    .sessionId(sessionDbId)
                    .dimension(dim.name())
                    .score(dim.score())
                    .anchorLabel(dim.anchorLabel())
                    .rationale(dim.rationale())
                    .evidence(writeJson(dim.evidence()))
                    .actionItems(writeJson(dim.actionItems()))
                    .rawJson(writeJson(Map.of(
                            "overallScore", report.overallScore(),
                            "dimensions", report.dimensions())))
                    .createdAt(now)
                    .build();
            evaluationScoreRepository.save(entity);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "{}";
        }
    }
}