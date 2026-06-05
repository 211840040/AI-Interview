package interview.guide.modules.exercise.service;

import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.exercise.dto.ExerciseQuestionDTO;
import interview.guide.modules.exercise.dto.GeneratedQuestionDTO;
import interview.guide.modules.exercise.model.ExerciseQuestionHistoryEntity;
import interview.guide.modules.exercise.model.ExerciseQuestionPoolEntity;
import interview.guide.modules.exercise.repository.ExerciseQuestionHistoryRepository;
import interview.guide.modules.exercise.repository.ExerciseQuestionPoolRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExerciseService {

  private static final int POOL_REFILL_THRESHOLD = 20;
  private static final int BATCH_GENERATE_COUNT = 10;

  private final ExerciseQuestionPoolRepository poolRepository;
  private final ExerciseQuestionHistoryRepository historyRepository;
  private final QuestionGeneratorService questionGeneratorService;

  @Transactional
  public List<ExerciseQuestionDTO> fetchQuestions(String domain, int count) {
    List<ExerciseQuestionPoolEntity> pool = poolRepository.findByDomain(domain);

    List<ExerciseQuestionDTO> result = new ArrayList<>();
    List<ExerciseQuestionHistoryEntity> histories = new ArrayList<>();

    // 1. 从缓存池取
    if (!pool.isEmpty()) {
      int takeCount = Math.min(pool.size(), count);
      List<ExerciseQuestionPoolEntity> taken = pool.subList(0, takeCount);
      List<Long> takenIds = taken.stream().map(ExerciseQuestionPoolEntity::getId).toList();
      poolRepository.deleteByIdIn(takenIds);

      for (ExerciseQuestionPoolEntity e : taken) {
        result.add(new ExerciseQuestionDTO(e.getId(), e.getDomain(), e.getQuestion(), null));
        histories.add(ExerciseQuestionHistoryEntity.builder()
            .domain(e.getDomain())
            .question(e.getQuestion())
            .referenceAnswer(e.getReferenceAnswer())
            .build());
      }
    }

    // 2. 不够则 AI 生成补充
    int remaining = count - result.size();
    if (remaining > 0) {
      List<GeneratedQuestionDTO> generated = questionGeneratorService.generateQuestions(domain, count);
      for (int i = 0; i < generated.size(); i++) {
        GeneratedQuestionDTO gq = generated.get(i);
        if (i < remaining) {
          result.add(new ExerciseQuestionDTO(null, domain, gq.question(), null));
          histories.add(ExerciseQuestionHistoryEntity.builder()
              .domain(domain)
              .question(gq.question())
              .referenceAnswer(gq.referenceAnswer())
              .build());
        } else {
          saveToPool(domain, gq);
        }
      }
    }

    // 3. 写入历史
    historyRepository.saveAll(histories);

    // 4. 检查并补充缓存池
    refillPoolIfNeeded(domain);

    return result;
  }

  @Transactional(readOnly = true)
  public ExerciseQuestionDTO getAnswer(Long historyId) {
    ExerciseQuestionHistoryEntity history = historyRepository.findById(historyId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_QUESTION_NOT_FOUND, "练习题不存在或已失效"));
    return new ExerciseQuestionDTO(history.getId(), history.getDomain(),
        history.getQuestion(), history.getReferenceAnswer());
  }

  @Transactional
  public void generateAndSaveToPool(String domain, int count) {
    List<GeneratedQuestionDTO> generated = questionGeneratorService.generateQuestions(domain, count);
    for (GeneratedQuestionDTO gq : generated) {
      saveToPool(domain, gq);
    }
    log.info("手动触发生成并存入缓存池: domain={}, count={}", domain, generated.size());
  }

  private void saveToPool(String domain, GeneratedQuestionDTO gq) {
    ExerciseQuestionPoolEntity entity = ExerciseQuestionPoolEntity.builder()
        .domain(domain)
        .question(gq.question())
        .referenceAnswer(gq.referenceAnswer())
        .build();
    poolRepository.save(entity);
  }

  private void refillPoolIfNeeded(String domain) {
    long count = poolRepository.countByDomain(domain);
    if (count < POOL_REFILL_THRESHOLD) {
      asyncRefillPool(domain);
    }
  }

  @Async
  protected void asyncRefillPool(String domain) {
    log.info("后台补充缓存池: domain={}", domain);
    try {
      List<GeneratedQuestionDTO> generated = questionGeneratorService.generateQuestions(domain, BATCH_GENERATE_COUNT);
      for (GeneratedQuestionDTO gq : generated) {
        saveToPool(domain, gq);
      }
      log.info("缓存池补充完成: domain={}, count={}", domain, generated.size());
    } catch (Exception e) {
      log.error("缓存池补充失败: domain={}, error={}", domain, e.getMessage(), e);
    }
  }
}
