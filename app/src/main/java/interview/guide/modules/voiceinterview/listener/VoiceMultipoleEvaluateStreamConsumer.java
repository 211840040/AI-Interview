package interview.guide.modules.voiceinterview.listener;

import interview.guide.common.async.AbstractStreamConsumer;
import interview.guide.common.ai.LlmProviderRegistry;
import interview.guide.common.constant.AsyncTaskStreamConstants;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.common.model.AsyncTaskStatus;
import interview.guide.infrastructure.redis.RedisService;
import interview.guide.modules.interview.model.InterviewQuestionDTO;
import interview.guide.modules.voiceinterview.model.VoiceInterviewMessageEntity;
import interview.guide.modules.voiceinterview.model.VoiceInterviewSessionEntity;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewMessageRepository;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewSessionRepository;
import interview.guide.modules.voiceinterview.service.VoiceMultipoleEvaluationService;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.stream.StreamMessageId;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 语音面试多维度评估 Stream 消费者
 * 负责从 Redis Stream 消费消息并执行多维度评估
 */
@Slf4j
@Component
public class VoiceMultipoleEvaluateStreamConsumer
        extends AbstractStreamConsumer<VoiceMultipoleEvaluateStreamConsumer.VoiceEvaluatePayload> {

    record VoiceEvaluatePayload(String sessionId) {
    }

    private final VoiceInterviewSessionRepository sessionRepository;
    private final VoiceInterviewMessageRepository messageRepository;
    private final VoiceMultipoleEvaluationService voiceMultipoleEvaluationService;
    private final LlmProviderRegistry llmProviderRegistry;

    public VoiceMultipoleEvaluateStreamConsumer(RedisService redisService,
            VoiceInterviewSessionRepository sessionRepository,
            VoiceInterviewMessageRepository messageRepository,
            VoiceMultipoleEvaluationService voiceMultipoleEvaluationService,
            LlmProviderRegistry llmProviderRegistry) {
        super(redisService);
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.voiceMultipoleEvaluationService = voiceMultipoleEvaluationService;
        this.llmProviderRegistry = llmProviderRegistry;
    }

    @Override
    protected String taskDisplayName() {
        return "语音面试多维度评估";
    }

    @Override
    protected String streamKey() {
        return AsyncTaskStreamConstants.VOICE_EVALUATE_MULTIPOLE_STREAM_KEY;
    }

    @Override
    protected String groupName() {
        return AsyncTaskStreamConstants.VOICE_EVALUATE_MULTIPOLE_GROUP_NAME;
    }

    @Override
    protected String consumerPrefix() {
        return AsyncTaskStreamConstants.VOICE_EVALUATE_MULTIPOLE_CONSUMER_PREFIX;
    }

    @Override
    protected String threadName() {
        return "voice-multipole-evaluate-consumer";
    }

    @Override
    protected VoiceEvaluatePayload parsePayload(StreamMessageId messageId, Map<String, String> data) {
        String sessionId = data.get(AsyncTaskStreamConstants.FIELD_VOICE_SESSION_ID);
        if (sessionId == null) {
            log.warn("消息格式错误，跳过: messageId={}", messageId);
            return null;
        }
        return new VoiceEvaluatePayload(sessionId);
    }

    @Override
    protected String payloadIdentifier(VoiceEvaluatePayload payload) {
        return "voiceSessionId=" + payload.sessionId();
    }

    @Override
    protected void markProcessing(VoiceEvaluatePayload payload) {
        updateEvaluateStatus(payload.sessionId(), AsyncTaskStatus.PROCESSING, null);
    }

    @Override
    protected void processBusiness(VoiceEvaluatePayload payload) {
        String sessionId = payload.sessionId();
        Long sessionIdLong;
        try {
            sessionIdLong = Long.parseLong(sessionId);
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.VOICE_SESSION_NOT_FOUND,
                    "无效语音面试会话ID: " + sessionId);
        }

        Optional<VoiceInterviewSessionEntity> sessionOpt = sessionRepository.findById(sessionIdLong);
        if (sessionOpt.isEmpty()) {
            log.warn("会话已被删除，跳过多维度评估任务: sessionId={}", sessionId);
            return;
        }

        VoiceInterviewSessionEntity session = sessionOpt.get();

        List<VoiceInterviewMessageEntity> messages = messageRepository
                .findBySessionIdOrderBySequenceNumAsc(sessionIdLong);

        if (messages.isEmpty()) {
            log.warn("语音面试会话无对话记录，跳过多维度评估: sessionId={}", sessionId);
            return;
        }

        try {
            String provider = session.getLlmProvider();
            ChatClient chatClient = llmProviderRegistry.getChatClientOrDefault(provider);

            voiceMultipoleEvaluationService.evaluateVoiceSession(
                    chatClient, session, buildQaRecordsFromMessages(messages));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("语音面试多维度评估失败: sessionId={}, error={}", sessionId, e.getMessage(), e);
            throw new BusinessException(ErrorCode.VOICE_EVALUATION_FAILED,
                    "语音面试多维度评估失败: " + e.getMessage());
        }
    }

    /**
     * 从语音面试消息构建问答记录
     */
    private List<InterviewQuestionDTO> buildQaRecordsFromMessages(
            List<VoiceInterviewMessageEntity> messages) {
        List<InterviewQuestionDTO> qaRecords = new ArrayList<>();
        int index = 0;

        for (VoiceInterviewMessageEntity msg : messages) {
            String aiText = VoiceInterviewMessageEntity.trimToNull(msg.getAiGeneratedText());
            String userText = VoiceInterviewMessageEntity.trimToNull(msg.getUserRecognizedText());

            if (aiText != null) {
                InterviewQuestionDTO question = InterviewQuestionDTO.create(
                        index, aiText, null, inferCategory(aiText), null, false, null);
                if (userText != null) {
                    question = question.withAnswer(userText);
                }
                qaRecords.add(question);
                index++;
            } else if (userText != null) {
                qaRecords.add(InterviewQuestionDTO.create(
                        index, "", null, "综合", null, false, null));
                index++;
            }
        }

        return qaRecords;
    }

    private String inferCategory(String aiText) {
        if (aiText == null)
            return "综合";
        if (aiText.contains("项目") || aiText.contains("实习") || aiText.contains("工作经历"))
            return "项目深挖";
        if (aiText.contains("自我介绍") || aiText.contains("介绍一下自己"))
            return "自我介绍";
        if (aiText.contains("职业规划") || aiText.contains("为什么") || aiText.contains("优缺点"))
            return "HR问题";
        return "技术问题";
    }

    @Override
    protected void markCompleted(VoiceEvaluatePayload payload) {
        updateEvaluateStatus(payload.sessionId(), AsyncTaskStatus.COMPLETED, null);
    }

    @Override
    protected void markFailed(VoiceEvaluatePayload payload, String error) {
        updateEvaluateStatus(payload.sessionId(), AsyncTaskStatus.FAILED, error);
    }

    @Override
    protected void retryMessage(VoiceEvaluatePayload payload, int retryCount) {
        String sessionId = payload.sessionId();
        try {
            Map<String, String> message = Map.of(
                    AsyncTaskStreamConstants.FIELD_VOICE_SESSION_ID, sessionId,
                    AsyncTaskStreamConstants.FIELD_RETRY_COUNT, String.valueOf(retryCount));

            redisService().streamAdd(
                    AsyncTaskStreamConstants.VOICE_EVALUATE_MULTIPOLE_STREAM_KEY,
                    message,
                    AsyncTaskStreamConstants.STREAM_MAX_LEN);
            log.info("语音面试多维度评估任务已重新入队: sessionId={}, retryCount={}", sessionId, retryCount);

        } catch (Exception e) {
            log.error("重试入队失败: sessionId={}, error={}", sessionId, e.getMessage(), e);
            updateEvaluateStatus(sessionId, AsyncTaskStatus.FAILED,
                    truncateError("重试入队失败: " + e.getMessage()));
        }
    }

    private void updateEvaluateStatus(String sessionId, AsyncTaskStatus status, String error) {
        try {
            Long sessionIdLong = Long.parseLong(sessionId);
            sessionRepository.findById(sessionIdLong).ifPresent(session -> {
                session.setMultipoleEvaluateStatus(status);
                session.setMultipoleEvaluateError(error);
                sessionRepository.save(session);
                log.debug("语音面试多维度评估状态已更新: sessionId={}, status={}", sessionId, status);
            });
        } catch (Exception e) {
            log.error("语音面试多维度评估状态更新失败: sessionId={}, status={}, error={}",
                    sessionId, status, e.getMessage(), e);
        }
    }
}