package interview.guide.modules.interview.listener;

import interview.guide.common.async.AbstractStreamProducer;
import interview.guide.common.constant.AsyncTaskStreamConstants;
import interview.guide.common.model.AsyncTaskStatus;
import interview.guide.infrastructure.redis.RedisService;
import interview.guide.modules.interview.repository.InterviewSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 面试多维度评估任务生产者
 * 负责发送多维度评估任务到独立 Stream
 */
@Slf4j
@Component
public class MultipoleEvaluateStreamProducer extends AbstractStreamProducer<String> {

    private final InterviewSessionRepository sessionRepository;

    public MultipoleEvaluateStreamProducer(RedisService redisService,
                                          InterviewSessionRepository sessionRepository) {
        super(redisService);
        this.sessionRepository = sessionRepository;
    }

    /**
     * 发送多维度评估任务到 Redis Stream
     */
    public void sendMultipoleTask(String sessionId) {
        sendTask(sessionId);
    }

    @Override
    protected String taskDisplayName() {
        return "多维度评估";
    }

    @Override
    protected String streamKey() {
        return AsyncTaskStreamConstants.INTERVIEW_EVALUATE_MULTIPOLE_STREAM_KEY;
    }

    @Override
    protected Map<String, String> buildMessage(String sessionId) {
        return Map.of(
            AsyncTaskStreamConstants.FIELD_SESSION_ID, sessionId,
            AsyncTaskStreamConstants.FIELD_RETRY_COUNT, "0"
        );
    }

    @Override
    protected String payloadIdentifier(String sessionId) {
        return "sessionId=" + sessionId;
    }

    @Override
    protected void onSendFailed(String sessionId, String error) {
        updateEvaluateStatus(sessionId, AsyncTaskStatus.FAILED, truncateError(error));
    }

    private void updateEvaluateStatus(String sessionId, AsyncTaskStatus status, String error) {
        sessionRepository.findBySessionId(sessionId).ifPresent(session -> {
            session.setEvaluateStatus(status);
            if (error != null) {
                session.setEvaluateError(error.length() > 500 ? error.substring(0, 500) : error);
            }
            sessionRepository.save(session);
        });
    }
}
