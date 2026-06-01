package interview.guide.modules.voiceinterview.listener;

import interview.guide.common.async.AbstractStreamProducer;
import interview.guide.common.constant.AsyncTaskStreamConstants;
import interview.guide.common.model.AsyncTaskStatus;
import interview.guide.infrastructure.redis.RedisService;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 语音面试多维度评估任务生产者
 * 负责发送多维度评估任务到独立 Redis Stream
 */
@Slf4j
@Component
public class VoiceMultipoleEvaluateStreamProducer extends AbstractStreamProducer<String> {

    private final VoiceInterviewSessionRepository sessionRepository;

    public VoiceMultipoleEvaluateStreamProducer(RedisService redisService,
                                                VoiceInterviewSessionRepository sessionRepository) {
        super(redisService);
        this.sessionRepository = sessionRepository;
    }

    /**
     * 发送语音面试多维度评估任务到 Redis Stream
     */
    public void sendMultipoleTask(String sessionId) {
        sendTask(sessionId);
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
    protected Map<String, String> buildMessage(String sessionId) {
        return Map.of(
            AsyncTaskStreamConstants.FIELD_VOICE_SESSION_ID, sessionId,
            AsyncTaskStreamConstants.FIELD_RETRY_COUNT, "0"
        );
    }

    @Override
    protected String payloadIdentifier(String sessionId) {
        return "voiceSessionId=" + sessionId;
    }

    @Override
    protected void onSendFailed(String sessionId, String error) {
        updateEvaluateStatus(sessionId, AsyncTaskStatus.FAILED, truncateError(error));
    }

    private void updateEvaluateStatus(String sessionId, AsyncTaskStatus status, String error) {
        try {
            Long sessionIdLong = Long.parseLong(sessionId);
            sessionRepository.findById(sessionIdLong).ifPresent(session -> {
                session.setMultipoleEvaluateStatus(status);
                if (error != null) {
                    session.setMultipoleEvaluateError(error.length() > 500 ? error.substring(0, 500) : error);
                }
                sessionRepository.save(session);
            });
        } catch (NumberFormatException e) {
            log.warn("无效语音面试会话ID: {}", sessionId);
        }
    }
}
