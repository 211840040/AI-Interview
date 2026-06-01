package interview.guide.modules.interview.controller;

import interview.guide.common.result.Result;
import interview.guide.modules.interview.model.EvaluationScoreEntity;
import interview.guide.modules.interview.model.InterviewSessionEntity;
import interview.guide.modules.interview.repository.EvaluationScoreRepository;
import interview.guide.modules.interview.repository.InterviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/interview")
@RequiredArgsConstructor
public class EvaluationHistoryController {

    private final EvaluationScoreRepository evaluationScoreRepository;
    private final InterviewSessionRepository sessionRepository;

    @GetMapping("/evaluation-history")
    public ResponseEntity<Result<List<EvaluationScoreEntity>>> getEvaluationHistory(
            @RequestParam(required = false) String sessionId,
            @RequestParam(required = false) String dimension) {

        List<EvaluationScoreEntity> history;

        if (sessionId != null && dimension != null) {
            Long sessionDbId = sessionRepository.findBySessionId(sessionId)
                .map(InterviewSessionEntity::getId)
                .orElse(null);
            if (sessionDbId == null) {
                return ResponseEntity.ok(Result.error(3001, "面试会话不存在"));
            }
            history = evaluationScoreRepository.findBySessionIdAndDimensionOrderByCreatedAtAsc(sessionDbId, dimension);
        } else if (sessionId != null) {
            Long sessionDbId = sessionRepository.findBySessionId(sessionId)
                .map(InterviewSessionEntity::getId)
                .orElse(null);
            if (sessionDbId == null) {
                return ResponseEntity.ok(Result.error(3001, "面试会话不存在"));
            }
            history = evaluationScoreRepository.findBySessionId(sessionDbId);
        } else if (dimension != null) {
            history = evaluationScoreRepository.findByDimensionOrderByCreatedAtAsc(dimension);
        } else {
            return ResponseEntity.badRequest().body(Result.error(1001, "必须提供 sessionId 和/或 dimension 参数"));
        }

        return ResponseEntity.ok(Result.success(history));
    }
}
