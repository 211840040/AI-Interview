package interview.guide.modules.exercise;

import interview.guide.common.annotation.RateLimit;
import interview.guide.common.result.Result;
import interview.guide.modules.exercise.dto.AddSheetQuestionRequest;
import interview.guide.modules.exercise.dto.CreateSheetRequest;
import interview.guide.modules.exercise.dto.ExerciseQuestionDTO;
import interview.guide.modules.exercise.dto.ExerciseSheetDTO;
import interview.guide.modules.exercise.dto.ExerciseSheetDetailDTO;
import interview.guide.modules.exercise.dto.SheetQuestionDTO;
import interview.guide.modules.exercise.dto.UpdateSheetRequest;
import interview.guide.modules.exercise.service.ExerciseService;
import interview.guide.modules.exercise.service.ExerciseSheetService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/exercise")
@RequiredArgsConstructor
@Tag(name = "专项练习", description = "八股知识点练习、题单管理与练习模式")
public class ExerciseController {

  private final ExerciseService exerciseService;
  private final ExerciseSheetService sheetService;

  // ==================== 专项练习 ====================

  @GetMapping("/question/next")
  @RateLimit(dimension = RateLimit.Dimension.GLOBAL, count = 10)
  @RateLimit(dimension = RateLimit.Dimension.IP, count = 5)
  public Result<ExerciseQuestionDTO> nextQuestion(@RequestParam String domain) {
    log.info("获取下一题: domain={}", domain);
    return Result.success(exerciseService.nextQuestion(domain));
  }

  @GetMapping("/question/{id}/answer")
  public Result<ExerciseQuestionDTO> getAnswer(@PathVariable Long id) {
    return Result.success(exerciseService.getAnswer(id));
  }

  @PostMapping("/questions/generate")
  @RateLimit(dimension = RateLimit.Dimension.GLOBAL, count = 3)
  public Result<Void> generateQuestions(@RequestBody Map<String, Object> body) {
    String domain = (String) body.get("domain");
    int count = body.get("count") instanceof Integer i ? i : 10;
    exerciseService.generateAndSaveToPool(domain, count);
    return Result.success(null);
  }

  // ==================== 收藏 ====================

  @PostMapping("/question/{id}/favorite")
  public Result<Void> favoriteQuestion(
      @PathVariable Long id,
      @RequestParam Long sheetId) {
    sheetService.favoriteQuestionToSheet(id, sheetId);
    return Result.success(null);
  }

  // ==================== 题单管理 ====================

  @GetMapping("/sheets")
  public Result<List<ExerciseSheetDTO>> listSheets() {
    return Result.success(sheetService.listSheets());
  }

  @PostMapping("/sheets")
  public Result<ExerciseSheetDTO> createSheet(@RequestBody CreateSheetRequest request) {
    return Result.success(sheetService.createSheet(request));
  }

  @GetMapping("/sheets/{id}")
  public Result<ExerciseSheetDetailDTO> getSheetDetail(@PathVariable Long id) {
    return Result.success(sheetService.getSheetDetail(id));
  }

  @PutMapping("/sheets/{id}")
  public Result<ExerciseSheetDTO> updateSheet(
      @PathVariable Long id,
      @RequestBody UpdateSheetRequest request) {
    return Result.success(sheetService.updateSheet(id, request));
  }

  @DeleteMapping("/sheets/{id}")
  public Result<Void> deleteSheet(@PathVariable Long id) {
    sheetService.deleteSheet(id);
    return Result.success(null);
  }

  @PostMapping("/sheets/{id}/questions")
  public Result<List<SheetQuestionDTO>> addQuestions(
      @PathVariable Long id,
      @RequestBody List<AddSheetQuestionRequest> requests) {
    return Result.success(sheetService.addQuestionsToSheet(id, requests));
  }

  @DeleteMapping("/sheets/{id}/questions/{questionId}")
  public Result<Void> deleteQuestion(
      @PathVariable Long id,
      @PathVariable Long questionId) {
    sheetService.deleteQuestionFromSheet(id, questionId);
    return Result.success(null);
  }

  // ==================== 练习模式 ====================

  @PostMapping("/sheets/{id}/practice")
  public Result<List<ExerciseQuestionDTO>> practiceFromSheet(
      @PathVariable Long id,
      @RequestParam(required = false, defaultValue = "0") int count) {
    Integer cnt = count > 0 ? count : null;
    return Result.success(sheetService.practiceFromSheet(id, cnt));
  }
}
