package interview.guide.modules.exercise.service;

import interview.guide.modules.exercise.dto.ExerciseQuestionDTO;
import interview.guide.modules.exercise.dto.GeneratedQuestionDTO;
import interview.guide.modules.exercise.model.ExerciseQuestionPoolEntity;
import interview.guide.modules.exercise.repository.ExerciseQuestionPoolRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("ExerciseService 异步供给测试")
class ExerciseServiceAsyncTest {

  @Mock
  private ExerciseQuestionPoolRepository poolRepository;

  @Mock
  private QuestionGeneratorService questionGeneratorService;

  @Mock
  private ExerciseService self;

  private ExerciseService exerciseService;

  @BeforeEach
  void setUp() {
    exerciseService = new ExerciseService(poolRepository, questionGeneratorService, self);
  }

  @Nested
  @DisplayName("asyncRefillPool 方法")
  class AsyncRefillMethodTest {

    @Test
    @DisplayName("成功生成题目并保存到池，完成后触发清理检查")
    void shouldGenerateAndSaveQuestions() {
      List<GeneratedQuestionDTO> generated = List.of(
          new GeneratedQuestionDTO("Q1?", "A1"),
          new GeneratedQuestionDTO("Q2?", "A2"),
          new GeneratedQuestionDTO("Q3?", "A3"),
          new GeneratedQuestionDTO("Q4?", "A4"),
          new GeneratedQuestionDTO("Q5?", "A5")
      );
      when(questionGeneratorService.generateQuestions("java", 5)).thenReturn(generated);
      when(poolRepository.countByDomain("java")).thenReturn(3L); // < MAX_QA_NUMS, 不触发清理

      exerciseService.asyncRefillPool("java");

      verify(questionGeneratorService, times(1)).generateQuestions("java", 5);
      verify(poolRepository, times(5)).save(any(ExerciseQuestionPoolEntity.class));
      verify(poolRepository, atLeastOnce()).countByDomain("java");
    }

    @Test
    @DisplayName("AI 生成异常时静默处理，不抛出异常")
    void shouldHandleGenerationFailureGracefully() {
      when(questionGeneratorService.generateQuestions("java", 5))
          .thenThrow(new RuntimeException("AI service unavailable"));

      exerciseService.asyncRefillPool("java");

      verify(questionGeneratorService, times(1)).generateQuestions("java", 5);
      verify(poolRepository, never()).save(any(ExerciseQuestionPoolEntity.class));
    }

    @Test
    @DisplayName("池中题目超过上限时应触发清理")
    void shouldTriggerCleanupWhenPoolFull() {
      List<GeneratedQuestionDTO> generated = List.of(
          new GeneratedQuestionDTO("Q1?", "A1"),
          new GeneratedQuestionDTO("Q2?", "A2")
      );
      when(questionGeneratorService.generateQuestions("java", 5)).thenReturn(generated);
      // 已有 50 题 + 新增 2 题 = 52 >= 50, 触发清理
      when(poolRepository.countByDomain("java")).thenReturn(52L);
      // 清理时返回 25 道最热的题
      List<ExerciseQuestionPoolEntity> topDone = createTopDoneQuestions(25);
      when(poolRepository.findTopDoneQuestions("java")).thenReturn(topDone);

      exerciseService.asyncRefillPool("java");

      verify(poolRepository, times(2)).save(any(ExerciseQuestionPoolEntity.class));
      verify(poolRepository, atLeastOnce()).countByDomain("java");
      verify(poolRepository, times(1)).findTopDoneQuestions("java");
      verify(poolRepository, times(1)).deleteAll(topDone.subList(0, 25));
    }
  }

  @Nested
  @DisplayName("补给触发条件")
  class SupplyTriggerTest {

    @Test
    @DisplayName("新题数量 ≤ 5 时应通过 self 代理触发异步补给")
    void shouldTriggerAsyncRefillWhenNewQuestionsLow() {
      // 池中有 3 道复习题，0 道新题 — 触发补给
      List<ExerciseQuestionPoolEntity> pool = List.of(
          createPoolEntity(1L, "java", "Q1", "A1", 3, 0),
          createPoolEntity(2L, "java", "Q2", "A2", 2, 0),
          createPoolEntity(3L, "java", "Q3", "A3", 1, 0)
      );
      when(poolRepository.findByDomain("java")).thenReturn(pool);
      when(poolRepository.findNewQuestions("java")).thenReturn(List.of());
      when(poolRepository.findReviewableQuestions("java")).thenReturn(pool);
      when(poolRepository.findCoolingDownQuestions("java")).thenReturn(List.of());
      when(poolRepository.countByDomainAndDoneCnt("java", 0)).thenReturn(0L);
      when(poolRepository.countByDomain("java")).thenReturn(3L);
      // save 被调用了两次：一次 save(picked)，一次 saveAll(cooling)
      when(poolRepository.saveAll(anyList())).thenReturn(List.of());

      ExerciseQuestionDTO result = exerciseService.nextQuestion("java");

      assertThat(result).isNotNull();
      assertThat(result.question()).isNotNull();
      assertThat(result.referenceAnswer()).isNull(); // 取题时不返回答案
      verify(self, times(1)).asyncRefillPool("java");
    }

    @Test
    @DisplayName("新题数量充足时不触发补给")
    void shouldNotTriggerAsyncRefillWhenNewQuestionsSufficient() {
      // 池中有 6 道新题 — 不触发补给
      List<ExerciseQuestionPoolEntity> pool = List.of(
          createPoolEntity(1L, "java", "Q1", "A1", 0, 0),
          createPoolEntity(2L, "java", "Q2", "A2", 0, 0),
          createPoolEntity(3L, "java", "Q3", "A3", 0, 0),
          createPoolEntity(4L, "java", "Q4", "A4", 0, 0),
          createPoolEntity(5L, "java", "Q5", "A5", 0, 0),
          createPoolEntity(6L, "java", "Q6", "A6", 0, 0)
      );
      when(poolRepository.findByDomain("java")).thenReturn(pool);
      when(poolRepository.findNewQuestions("java")).thenReturn(pool);
      when(poolRepository.findReviewableQuestions("java")).thenReturn(List.of());
      when(poolRepository.findCoolingDownQuestions("java")).thenReturn(List.of());
      when(poolRepository.countByDomainAndDoneCnt("java", 0)).thenReturn(6L);
      when(poolRepository.countByDomain("java")).thenReturn(6L);
      when(poolRepository.saveAll(anyList())).thenReturn(List.of());

      ExerciseQuestionDTO result = exerciseService.nextQuestion("java");

      assertThat(result).isNotNull();
      verify(self, never()).asyncRefillPool(anyString());
    }

    @Test
    @DisplayName("空池时触发初始化生成（同步），不触发异步补给")
    void shouldInitializePoolWhenEmpty() {
      when(poolRepository.findByDomain("java")).thenReturn(List.of());
      List<GeneratedQuestionDTO> generated = List.of(
          new GeneratedQuestionDTO("Q1?", "A1"),
          new GeneratedQuestionDTO("Q2?", "A2"),
          new GeneratedQuestionDTO("Q3?", "A3"),
          new GeneratedQuestionDTO("Q4?", "A4"),
          new GeneratedQuestionDTO("Q5?", "A5"),
          new GeneratedQuestionDTO("Q6?", "A6"),
          new GeneratedQuestionDTO("Q7?", "A7"),
          new GeneratedQuestionDTO("Q8?", "A8")
      );
      when(questionGeneratorService.generateQuestions("java", 8))
          .thenReturn(generated);
      // initializeAndFetch 会调 findNewQuestions 取第一道
      List<ExerciseQuestionPoolEntity> firstNew = List.of(
          createPoolEntity(100L, "java", "Q1?", "A1", 0, 0)
      );
      when(poolRepository.findNewQuestions("java")).thenReturn(firstNew);

      ExerciseQuestionDTO result = exerciseService.nextQuestion("java");

      assertThat(result).isNotNull();
      // 空池走同步初始化，不走异步补给
      verify(self, never()).asyncRefillPool(anyString());
    }
  }

  private static List<ExerciseQuestionPoolEntity> createTopDoneQuestions(int count) {
    return IntStream.range(0, count)
        .mapToObj(i -> createPoolEntity((long) i, "java", "old" + i, "oldA" + i, 50 - i, 0))
        .toList();
  }

  private static ExerciseQuestionPoolEntity createPoolEntity(
      Long id, String domain, String question, String answer,
      int doneCnt, int countdown) {
    return ExerciseQuestionPoolEntity.builder()
        .id(id)
        .domain(domain)
        .question(question)
        .referenceAnswer(answer)
        .doneCnt(doneCnt)
        .countdown(countdown)
        .build();
  }
}
