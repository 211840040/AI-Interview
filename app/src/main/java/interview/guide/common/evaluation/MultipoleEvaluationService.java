package interview.guide.common.evaluation;

import interview.guide.common.ai.StructuredOutputInvoker;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.interview.model.InterviewQuestionDTO;
import interview.guide.modules.interview.skill.InterviewSkillService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 多维度评估公共服务
 * 封装 LLM 调用、Prompt 渲染、结构化输出解析
 * 文字面试和语音面试都复用此服务，各自负责持久化到不同的表
 */
@Slf4j
@Service
public class MultipoleEvaluationService {

    private final StructuredOutputInvoker structuredOutputInvoker;
    private final InterviewSkillService skillService;
    private final ResourceLoader resourceLoader;
    private final ObjectMapper objectMapper;

    private static final String SYSTEM_PROMPT_PATH = "classpath:prompts/interview-evaluation-multipole-system.st";
    private static final String USER_PROMPT_PATH = "classpath:prompts/interview-evaluation-multipole-user.st";

    public MultipoleEvaluationService(StructuredOutputInvoker structuredOutputInvoker,
                                       InterviewSkillService skillService,
                                       ResourceLoader resourceLoader,
                                       ObjectMapper objectMapper) {
        this.structuredOutputInvoker = structuredOutputInvoker;
        this.skillService = skillService;
        this.resourceLoader = resourceLoader;
        this.objectMapper = objectMapper;
    }

    /**
     * LLM 多维度评估结果
     */
    public record MultipoleReportDTO(
            int overallScore,
            List<DimensionScoreDTO> dimensions) {
    }

    public record EvidenceItemDTO(
            String text
    ) {}

    public record ActionItemDTO(
            String title,
            String exercise
    ) {}

    /**
     * 单个维度评分
     */
    public record DimensionScoreDTO(
            String name,
            int score,
            String anchorLabel,
            String rationale,
            List<EvidenceItemDTO> evidence,
            List<ActionItemDTO> actionItems) {
    }

    /**
     * 执行多维度评估
     *
     * @param chatClient LLM ChatClient
     * @param sessionDbId 会话ID（仅用于日志和错误追踪）
     * @param skillId 技能ID，用于构建参考上下文
     * @param questions QA记录列表
     * @return 评估报告
     */
    public MultipoleReportDTO evaluate(ChatClient chatClient,
                                        Long sessionDbId,
                                        String skillId,
                                        List<InterviewQuestionDTO> questions) {
        try {
            String qaRecords = buildQaRecords(questions);
            String referenceContext = buildReferenceContext(skillId);

            String systemPrompt = loadPrompt(SYSTEM_PROMPT_PATH);
            String userPrompt = renderUserPrompt(qaRecords, referenceContext);

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
                    log);

            if (report == null || report.dimensions() == null || report.dimensions().isEmpty()) {
                throw new BusinessException(ErrorCode.INTERVIEW_EVALUATION_FAILED, "多维度评估结果为空");
            }

            return report;

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("多维度评估调用失败: sessionDbId={}, error={}", sessionDbId, e.getMessage(), e);
            throw new BusinessException(ErrorCode.INTERVIEW_EVALUATION_FAILED,
                    "多维度评估失败: " + e.getMessage());
        }
    }

    public String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            log.warn("序列化JSON失败: {}", e.getMessage());
            return "{}";
        }
    }

    String buildQaRecords(List<InterviewQuestionDTO> questions) {
        StringBuilder sb = new StringBuilder();
        for (InterviewQuestionDTO q : questions) {
            sb.append("Q: ").append(q.question()).append("\n");
            sb.append("A: ").append(q.userAnswer() != null ? q.userAnswer() : "(未回答)").append("\n\n");
        }
        return sb.toString();
    }

    private String buildReferenceContext(String skillId) {
        String referenceContext = skillService.buildEvaluationReferenceSectionSafe(skillId);
        return referenceContext != null && !referenceContext.isBlank() ? referenceContext : "无";
    }

    private String renderUserPrompt(String qaRecords, String referenceContext) {
        String template = loadPrompt(USER_PROMPT_PATH);
        Map<String, Object> variables = new HashMap<>();
        variables.put("qaRecords", qaRecords);
        variables.put("referenceContext", referenceContext);
        return new PromptTemplate(template).render(variables);
    }

    private String loadPrompt(String path) {
        try {
            return resourceLoader.getResource(path).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to load prompt: {}", path, e);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "加载Prompt模板失败: " + path);
        }
    }
}