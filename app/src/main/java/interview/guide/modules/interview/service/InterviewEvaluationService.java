package interview.guide.modules.interview.service;

import interview.guide.common.ai.StructuredOutputInvoker;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.interview.model.EvaluationScoreEntity;
import interview.guide.modules.interview.model.InterviewQuestionDTO;
import interview.guide.modules.interview.model.InterviewSessionEntity;
import interview.guide.modules.interview.repository.EvaluationScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class InterviewEvaluationService {

    private final StructuredOutputInvoker structuredOutputInvoker;
    private final EvaluationScoreRepository evaluationScoreRepository;
    private final InterviewSkillService skillService;
    private final ResourceLoader resourceLoader;

    private static final String SYSTEM_PROMPT_PATH = "classpath:prompts/interview-evaluation-multipole-system.st";
    private static final String USER_PROMPT_PATH = "classpath:prompts/interview-evaluation-multipole-user.st";

    private record MultipoleReportDTO(
        int overallScore,
        List<DimensionScoreDTO> dimensions
    ) {}

    private record DimensionScoreDTO(
        String name,
        int score,
        String anchorLabel,
        String rationale,
        List<Map<String, String>> evidence,
        List<Map<String, String>> actionItems
    ) {}

    public void evaluateSession(ChatClient chatClient,
                                InterviewSessionEntity session,
                                String resumeText,
                                List<InterviewQuestionDTO> questions) {
        String sessionId = session.getSessionId();
        try {
            String qaRecords = buildQaRecords(questions);
            String referenceContext = skillService.buildEvaluationReferenceSectionSafe(session.getSkillId());

            PromptTemplate systemTemplate = new PromptTemplate(loadPrompt(SYSTEM_PROMPT_PATH));
            PromptTemplate userTemplate = new PromptTemplate(loadPrompt(USER_PROMPT_PATH));

            Map<String, Object> variables = new HashMap<>();
            variables.put("qaRecords", qaRecords);
            variables.put("referenceContext", referenceContext != null && !referenceContext.isBlank() ? referenceContext : "无");

            String systemPrompt = systemTemplate.render();
            String userPrompt = userTemplate.render(variables);

            BeanOutputConverter<MultipoleReportDTO> converter = new BeanOutputConverter<>(MultipoleReportDTO.class);
            String systemWithFormat = systemPrompt + "\n\n" + converter.getFormat();

            MultipoleReportDTO report = structuredOutputInvoker.invoke(
                chatClient,
                systemWithFormat,
                userPrompt,
                converter,
                ErrorCode.INTERVIEW_EVALUATION_FAILED,
                "多维度评估失败：",
                "多维度评估",
                log
            );

            if (report == null || report.dimensions() == null || report.dimensions().isEmpty()) {
                throw new BusinessException(ErrorCode.INTERVIEW_EVALUATION_FAILED, "多维度评估结果为空");
            }

            persistScores(session.getId(), report, systemPrompt, userPrompt);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("多维度评估持久化失败: sessionId={}, error={}", sessionId, e.getMessage(), e);
            throw new BusinessException(ErrorCode.INTERVIEW_EVALUATION_FAILED, "多维度评估失败: " + e.getMessage());
        }
    }

    public List<EvaluationScoreEntity> getScoreBySessionId(Long sessionId) {
        return evaluationScoreRepository.findBySessionId(sessionId);
    }

    private void persistScores(Long sessionDbId,
                               MultipoleReportDTO report,
                               String systemPrompt,
                               String userPrompt) {
        LocalDateTime now = LocalDateTime.now();
        for (DimensionScoreDTO dim : report.dimensions()) {
            EvaluationScoreEntity entity = new EvaluationScoreEntity();
            entity.setSessionId(sessionDbId);
            entity.setDimension(dim.name());
            entity.setScore(dim.score());
            entity.setAnchorLabel(dim.anchorLabel());
            entity.setRationale(dim.rationale());
            entity.setEvidence(writeJson(dim.evidence()));
            entity.setActionItems(writeJson(dim.actionItems()));
            entity.setRawJson(writeJson(Map.of(
                "overallScore", report.overallScore(),
                "dimensions", report.dimensions(),
                "systemPrompt", systemPrompt,
                "userPrompt", userPrompt
            )));
            entity.setCreatedAt(now);
            evaluationScoreRepository.save(entity);
        }
    }

    private String buildQaRecords(List<InterviewQuestionDTO> questions) {
        StringBuilder sb = new StringBuilder();
        for (InterviewQuestionDTO q : questions) {
            sb.append("Q: ").append(q.question()).append("\n");
            sb.append("A: ").append(q.userAnswer() != null ? q.userAnswer() : "(未回答)").append("\n\n");
        }
        return sb.toString();
    }

    private String loadPrompt(String path) throws IOException {
        Resource resource = resourceLoader.getResource(path);
        return resource.getContentAsString(StandardCharsets.UTF_8);
    }

    private String writeJson(Object value) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(value);
        } catch (Exception e) {
            return "{}";
        }
    }
}
