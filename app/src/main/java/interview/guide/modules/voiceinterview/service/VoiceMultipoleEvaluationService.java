package interview.guide.modules.voiceinterview.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import interview.guide.common.evaluation.MultipoleEvaluationService;
import interview.guide.common.evaluation.MultipoleEvaluationService.DimensionScoreDTO;
import interview.guide.common.evaluation.MultipoleEvaluationService.MultipoleReportDTO;
import interview.guide.modules.interview.model.InterviewQuestionDTO;
import interview.guide.modules.voiceinterview.model.VoiceEvaluationScoreEntity;
import interview.guide.modules.voiceinterview.model.VoiceInterviewSessionEntity;
import interview.guide.modules.voiceinterview.repository.VoiceEvaluationScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 语音面试多维度评估服务
 * 复用 MultipoleEvaluationService 的评估逻辑，持久化到 voice_evaluation_scores 表
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VoiceMultipoleEvaluationService {

    private final MultipoleEvaluationService multipoleEvaluationService;
    private final VoiceEvaluationScoreRepository voiceEvaluationScoreRepository;
    private final ObjectMapper objectMapper;

    /**
     * 对语音面试会话执行多维度评估
     */
    public void evaluateVoiceSession(ChatClient chatClient,
                                      VoiceInterviewSessionEntity session,
                                      List<InterviewQuestionDTO> questions) {
        String skillId = session.getRoleType() != null && !session.getRoleType().isBlank()
                ? session.getRoleType()
                : null;

        MultipoleReportDTO report = multipoleEvaluationService.evaluate(
                chatClient, session.getId(), skillId, questions);

        persistScores(session.getId(), report);
    }

    private void persistScores(Long sessionDbId, MultipoleReportDTO report) {
        LocalDateTime now = LocalDateTime.now();
        for (DimensionScoreDTO dim : report.dimensions()) {
            VoiceEvaluationScoreEntity entity = VoiceEvaluationScoreEntity.builder()
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
            voiceEvaluationScoreRepository.save(entity);
        }
        log.info("语音面试多维度评估结果已持久化: sessionId={}, dimensions={}",
                sessionDbId, report.dimensions().size());
    }

    /**
     * 获取语音面试会话的多维度评估详情
     */
    public List<VoiceEvaluationScoreEntity> getScoresBySessionId(Long sessionId) {
        return voiceEvaluationScoreRepository.findBySessionId(sessionId);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            log.warn("序列化JSON失败: {}", e.getMessage());
            return "{}";
        }
    }
}