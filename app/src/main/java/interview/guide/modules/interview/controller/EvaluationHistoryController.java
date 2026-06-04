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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/interview")
@RequiredArgsConstructor
public class EvaluationHistoryController {

    private final EvaluationScoreRepository evaluationScoreRepository;
    private final InterviewSessionRepository sessionRepository;

    /**
     * 获取评估历史（基础，返回 EvaluationScoreEntity）
     */
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
            history = evaluationScoreRepository.findAllByOrderByCreatedAtAsc();
        }

        return ResponseEntity.ok(Result.success(history));
    }

    /**
     * 获取评估历史（含会话UUID，用于前端趋势图精确匹配）
     */
    @GetMapping("/evaluation-history/enriched")
    public ResponseEntity<Result<List<EnrichedScoreDTO>>> getEnrichedHistory() {
        List<EvaluationScoreEntity> scores = evaluationScoreRepository.findAllByOrderByCreatedAtAsc();

        // 构建 DB internalId -> sessionUuid 映射
        Map<Long, String> idToUuid = new HashMap<>();
        for (EvaluationScoreEntity score : scores) {
            if (!idToUuid.containsKey(score.getSessionId())) {
                sessionRepository.findById(score.getSessionId())
                    .ifPresent(s -> idToUuid.put(score.getSessionId(), s.getSessionId()));
            }
        }

        List<EnrichedScoreDTO> result = scores.stream()
            .map(s -> new EnrichedScoreDTO(
                s.getId(),
                s.getSessionId(),
                idToUuid.get(s.getSessionId()),
                s.getDimension(),
                s.getScore(),
                s.getAnchorLabel(),
                s.getRationale(),
                s.getEvidence(),
                s.getActionItems(),
                s.getRawJson(),
                s.getCreatedAt()
            ))
            .toList();

        return ResponseEntity.ok(Result.success(result));
    }

    /**
     * 富化评估分数 DTO（含会话UUID用于精确匹配）
     */
    public record EnrichedScoreDTO(
        Long id,
        Long sessionId,
        String sessionUuid,
        String dimension,
        Integer score,
        String anchorLabel,
        String rationale,
        String evidence,
        String actionItems,
        String rawJson,
        java.time.LocalDateTime createdAt
    ) {}
}
