package interview.guide.modules.interview.controller;

import interview.guide.common.result.Result;
import interview.guide.modules.interview.model.EvaluationScoreEntity;
import interview.guide.modules.interview.repository.InterviewSessionRepository;
import interview.guide.modules.interview.service.InterviewEvaluationService;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/interview")
@RequiredArgsConstructor
public class EvaluationController {

    private final InterviewEvaluationService interviewEvaluationService;
    private final InterviewSessionRepository sessionRepository;
    private final VoiceInterviewSessionRepository voiceSessionRepository;

    @GetMapping("/sessions/{sessionId}/evaluation-details")
    public ResponseEntity<Result<List<EvaluationScoreEntity>>> getEvaluationDetails(
            @PathVariable String sessionId) {
        return sessionRepository.findBySessionId(sessionId)
            .map(session -> interviewEvaluationService.getScoreBySessionId(session.getId()))
            .map(scores -> ResponseEntity.ok(Result.success(scores)))
            .orElseGet(() -> ResponseEntity.ok(Result.error(3001, "面试会话不存在")));
    }

    /**
     * 获取语音面试的多维度评估详情
     * 使用路径参数区分语音面试（/voice/{sessionId}/evaluation-details）
     */
    @GetMapping("/voice/{sessionId}/evaluation-details")
    public ResponseEntity<Result<List<EvaluationScoreEntity>>> getVoiceEvaluationDetails(
            @PathVariable Long sessionId) {
        List<EvaluationScoreEntity> scores = interviewEvaluationService.getScoreBySessionId(sessionId);
        return ResponseEntity.ok(Result.success(scores));
    }
}
