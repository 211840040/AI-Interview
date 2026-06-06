package interview.guide.modules.exercise.service;

import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.exercise.dto.ExerciseQuestionDTO;
import interview.guide.modules.exercise.dto.GeneratedQuestionDTO;
import interview.guide.modules.exercise.model.ExerciseQuestionPoolEntity;
import interview.guide.modules.exercise.repository.ExerciseQuestionPoolRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
public class ExerciseService {

  private static final int INITIAL_QA_NUMS = 8;
  private static final double REVIEW_PROB = 0.8;
  private static final int SUPPLY_THRESHOLD = 5;
  private static final int QA_PATCH_NUMS = 5;
  private static final int MAX_QA_NUMS = 50;
  private static final int COUNTDOWN_RESET = 3;

  private final ExerciseQuestionPoolRepository poolRepository;
  private final QuestionGeneratorService questionGeneratorService;
  private final ExerciseService self;

  public ExerciseService(ExerciseQuestionPoolRepository poolRepository,
                         QuestionGeneratorService questionGeneratorService,
                         @Lazy ExerciseService self) {
    this.poolRepository = poolRepository;
    this.questionGeneratorService = questionGeneratorService;
    this.self = self;
  }

  @Transactional
  public ExerciseQuestionDTO nextQuestion(String domain) {
    List<ExerciseQuestionPoolEntity> pool = poolRepository.findByDomain(domain);

    if (pool.isEmpty()) {
      return initializeAndFetch(domain);
    }

    // 每次抽题前对所有冷却中的题目 countdown 减一
    decrementAllCountdowns(domain);

    // 加权随机抽取
    List<ExerciseQuestionPoolEntity> available = poolRepository.findNewQuestions(domain);
    List<ExerciseQuestionPoolEntity> reviewable = poolRepository.findReviewableQuestions(domain);

    ExerciseQuestionPoolEntity picked = pickQuestion(available, reviewable);

    if (picked == null) {
      return initializeAndFetch(domain);
    }

    picked.setDoneCnt(picked.getDoneCnt() + 1);
    picked.setCountdown(COUNTDOWN_RESET);
    poolRepository.save(picked);

    log.info("抽题: id={}, domain={}, doneCnt={}, countdown={}",
        picked.getId(), domain, picked.getDoneCnt(), COUNTDOWN_RESET);

    // 补充和清理
    checkSupply(domain);
    checkCleanup(domain);

    return new ExerciseQuestionDTO(
        picked.getId(), picked.getDomain(), picked.getQuestion(), null);
  }

  @Transactional(readOnly = true)
  public ExerciseQuestionDTO getAnswer(Long questionId) {
    ExerciseQuestionPoolEntity question = poolRepository.findById(questionId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_QUESTION_NOT_FOUND, "练习题不存在"));
    return new ExerciseQuestionDTO(question.getId(), question.getDomain(),
        question.getQuestion(), question.getReferenceAnswer());
  }

  @Transactional
  public void generateAndSaveToPool(String domain, int count) {
    List<GeneratedQuestionDTO> generated = questionGeneratorService.generateQuestions(domain, count);
    saveToPool(domain, generated);
    log.info("手动触发生成并存入缓存池: domain={}, count={}", domain, generated.size());
    checkCleanup(domain);
  }

  private ExerciseQuestionDTO initializeAndFetch(String domain) {
    log.info("缓存池为空，初始化生成: domain={}, count={}", domain, INITIAL_QA_NUMS);
    List<GeneratedQuestionDTO> generated = questionGeneratorService.generateQuestions(domain, INITIAL_QA_NUMS);
    saveToPool(domain, generated);

    // 从刚生成的题中取第一道
    List<ExerciseQuestionPoolEntity> newPool = poolRepository.findNewQuestions(domain);
    if (newPool.isEmpty()) {
      throw new BusinessException(ErrorCode.EXERCISE_QUESTION_GENERATION_FAILED, "问题生成失败");
    }

    ExerciseQuestionPoolEntity first = newPool.getFirst();
    first.setDoneCnt(1);
    first.setCountdown(COUNTDOWN_RESET);
    poolRepository.save(first);

    return new ExerciseQuestionDTO(first.getId(), domain, first.getQuestion(), null);
  }

  private void decrementAllCountdowns(String domain) {
    List<ExerciseQuestionPoolEntity> cooling = poolRepository.findCoolingDownQuestions(domain);
    for (ExerciseQuestionPoolEntity e : cooling) {
      e.setCountdown(e.getCountdown() - 1);
    }
    poolRepository.saveAll(cooling);
  }

  private ExerciseQuestionPoolEntity pickQuestion(
      List<ExerciseQuestionPoolEntity> available,
      List<ExerciseQuestionPoolEntity> reviewable) {

    if (available.isEmpty() && reviewable.isEmpty()) {
      return null;
    }

    // 没有可复习的题，从新题中均匀抽取
    if (reviewable.isEmpty()) {
      return available.get((int) (Math.random() * available.size()));
    }

    // 没有新题，或按概率从复习题中抽取
    if (available.isEmpty() || Math.random() < REVIEW_PROB) {
      return weightedPick(reviewable);
    }

    // 剩余概率从新题中抽取
    return available.get((int) (Math.random() * available.size()));
  }

  private ExerciseQuestionPoolEntity weightedPick(List<ExerciseQuestionPoolEntity> candidates) {
    // 权重 = 1 / (doneCnt + 1)，doneCnt 越低的题权重越高（越需要优先复习）
    double totalWeight = candidates.stream()
        .mapToDouble(e -> 1.0 / (e.getDoneCnt() + 1))
        .sum();
    double threshold = Math.random() * totalWeight;
    double cumulative = 0;
    for (ExerciseQuestionPoolEntity e : candidates) {
      cumulative += 1.0 / (e.getDoneCnt() + 1);
      if (cumulative >= threshold) {
        return e;
      }
    }
    return candidates.getLast();
  }

  private void saveToPool(String domain, List<GeneratedQuestionDTO> questions) {
    for (GeneratedQuestionDTO gq : questions) {
      ExerciseQuestionPoolEntity entity = ExerciseQuestionPoolEntity.builder()
          .domain(domain)
          .question(gq.question())
          .referenceAnswer(gq.referenceAnswer())
          .doneCnt(0)
          .countdown(0)
          .build();
      poolRepository.save(entity);
    }
  }

  private void checkSupply(String domain) {
    long newCount = poolRepository.countByDomainAndDoneCnt(domain, 0);
    if (newCount <= SUPPLY_THRESHOLD) {
      log.info("新题数量不足 ({} <= {}), 触发后台补充", newCount, SUPPLY_THRESHOLD);
      self.asyncRefillPool(domain);
    }
  }

  private void checkCleanup(String domain) {
    long total = poolRepository.countByDomain(domain);
    if (total >= MAX_QA_NUMS) {
      List<ExerciseQuestionPoolEntity> topDone = poolRepository.findTopDoneQuestions(domain);
      int removeCount = MAX_QA_NUMS / 2;
      List<ExerciseQuestionPoolEntity> toRemove = topDone.subList(0, removeCount);
      poolRepository.deleteAll(toRemove);
      log.info("缓存池已达上限 {}，清理最热的 {} 道题目", MAX_QA_NUMS, removeCount);
    }
  }

  @Async
  public void asyncRefillPool(String domain) {
    log.info("后台补充缓存池: domain={}", domain);
    try {
      List<GeneratedQuestionDTO> generated = questionGeneratorService.generateQuestions(domain, QA_PATCH_NUMS);
      saveToPool(domain, generated);
      checkCleanup(domain);
      log.info("缓存池补充完成: domain={}, count={}", domain, generated.size());
    } catch (Exception e) {
      log.error("缓存池补充失败: domain={}, error={}", domain, e.getMessage(), e);
    }
  }
}
