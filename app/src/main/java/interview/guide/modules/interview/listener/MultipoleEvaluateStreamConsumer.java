package interview.guide.modules.interview.listener;

import interview.guide.common.async.AbstractStreamConsumer;
import interview.guide.common.ai.LlmProviderRegistry;
import interview.guide.common.constant.AsyncTaskStreamConstants;
import interview.guide.common.model.AsyncTaskStatus;
import interview.guide.infrastructure.redis.RedisService;
import interview.guide.modules.interview.model.InterviewAnswerEntity;
import interview.guide.modules.interview.model.InterviewQuestionDTO;
import interview.guide.modules.interview.model.InterviewSessionEntity;
import interview.guide.modules.interview.repository.InterviewSessionRepository;
import interview.guide.modules.interview.service.InterviewEvaluationService;
import interview.guide.modules.interview.service.InterviewPersistenceService;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.stream.StreamMessageId;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 面试多维度评估 Stream 消费者
 * 负责从 Redis Stream 消费消息并执行多维度评估
 */
@Slf4j
@Component
public class MultipoleEvaluateStreamConsumer extends AbstractStreamConsumer<MultipoleEvaluateStreamConsumer.EvaluatePayload> {

    private final InterviewSessionRepository sessionRepository;
    private final InterviewEvaluationService interviewEvaluationService;
    private final InterviewPersistenceService persistenceService;
    private final ObjectMapper objectMapper;
    private final LlmProviderRegistry llmProviderRegistry;

    public MultipoleEvaluateStreamConsumer(
        RedisService redisService,
        InterviewSessionRepository sessionRepository,
        InterviewEvaluationService interviewEvaluationService,
        InterviewPersistenceService persistenceService,
        ObjectMapper objectMapper,
        LlmProviderRegistry llmProviderRegistry
    ) {
        super(redisService);
        this.sessionRepository = sessionRepository;
        this.interviewEvaluationService = interviewEvaluationService;
        this.persistenceService = persistenceService;
        this.objectMapper = objectMapper;
        this.llmProviderRegistry = llmProviderRegistry;
    }

    record EvaluatePayload(String sessionId) {}

    @Override
    protected String taskDisplayName() {
        return "多维度评估";
    }

    @Override
    protected String streamKey() {
        return AsyncTaskStreamConstants.INTERVIEW_EVALUATE_MULTIPOLE_STREAM_KEY;
    }

    @Override
    protected String groupName() {
        return AsyncTaskStreamConstants.INTERVIEW_EVALUATE_MULTIPOLE_GROUP_NAME;
    }

    @Override
    protected String consumerPrefix() {
        return AsyncTaskStreamConstants.INTERVIEW_EVALUATE_MULTIPOLE_CONSUMER_PREFIX;
    }

    @Override
    protected String threadName() {
        return "multipole-evaluate-consumer";
    }

    @Override
    protected EvaluatePayload parsePayload(StreamMessageId messageId, Map<String, String> data) {
        String sessionId = data.get(AsyncTaskStreamConstants.FIELD_SESSION_ID);
        if (sessionId == null) {
            log.warn("消息格式错误，跳过: messageId={}", messageId);
            return null;
        }
        return new EvaluatePayload(sessionId);
    }

    @Override
    protected String payloadIdentifier(EvaluatePayload payload) {
        return "sessionId=" + payload.sessionId();
    }

    @Override
    protected void markProcessing(EvaluatePayload payload) {
        updateEvaluateStatus(payload.sessionId(), AsyncTaskStatus.PROCESSING, null);
    }

    @Override
    protected void processBusiness(EvaluatePayload payload) {
        String sessionId = payload.sessionId();
        Optional<InterviewSessionEntity> sessionOpt = sessionRepository.findBySessionIdWithResume(sessionId);
        if (sessionOpt.isEmpty()) {
            log.warn("会话已被删除，跳过多维度评估任务: sessionId={}", sessionId);
            return;
        }

        InterviewSessionEntity session = sessionOpt.get();
        List<InterviewQuestionDTO> questions = objectMapper.readValue(
            session.getQuestionsJson(),
            new TypeReference<>() {}
        );

        List<InterviewAnswerEntity> answers = persistenceService.findAnswersBySessionId(sessionId);
        for (InterviewAnswerEntity answer : answers) {
            int index = answer.getQuestionIndex();
            if (index >= 0 && index < questions.size()) {
                InterviewQuestionDTO question = questions.get(index);
                questions.set(index, question.withAnswer(answer.getUserAnswer()));
            }
        }

        String provider = session.getLlmProvider();
        ChatClient chatClient = llmProviderRegistry.getChatClientOrDefault(provider);

        String resumeText = session.getResume() != null ? session.getResume().getResumeText() : "";
        interviewEvaluationService.evaluateSession(chatClient, session, resumeText, questions);
    }

    @Override
    protected void markCompleted(EvaluatePayload payload) {
        updateEvaluateStatus(payload.sessionId(), AsyncTaskStatus.COMPLETED, null);
    }

    @Override
    protected void markFailed(EvaluatePayload payload, String error) {
        updateEvaluateStatus(payload.sessionId(), AsyncTaskStatus.FAILED, error);
    }

    @Override
    protected void retryMessage(EvaluatePayload payload, int retryCount) {
        String sessionId = payload.sessionId();
        try {
            Map<String, String> message = Map.of(
                AsyncTaskStreamConstants.FIELD_SESSION_ID, sessionId,
                AsyncTaskStreamConstants.FIELD_RETRY_COUNT, String.valueOf(retryCount)
            );

            redisService().streamAdd(
                AsyncTaskStreamConstants.INTERVIEW_EVALUATE_MULTIPOLE_STREAM_KEY,
                message,
                AsyncTaskStreamConstants.STREAM_MAX_LEN
            );
            log.info("多维度评估任务已重新入队: sessionId={}, retryCount={}", sessionId, retryCount);

        } catch (Exception e) {
            log.error("多维度评估重试入队失败: sessionId={}, error={}", sessionId, e.getMessage(), e);
            updateEvaluateStatus(sessionId, AsyncTaskStatus.FAILED, truncateError("多维度评估重试入队失败: " + e.getMessage()));
        }
    }

    private void updateEvaluateStatus(String sessionId, AsyncTaskStatus status, String error) {
        try {
            sessionRepository.findBySessionId(sessionId).ifPresent(session -> {
                session.setEvaluateStatus(status);
                session.setEvaluateError(error);
                sessionRepository.save(session);
                log.debug("多维度评估状态已更新: sessionId={}, status={}", sessionId, status);
            });
        } catch (Exception e) {
            log.error("多维度评估状态更新失败: sessionId={}, status={}, error={}", sessionId, status, e.getMessage(), e);
        }
    }
}
