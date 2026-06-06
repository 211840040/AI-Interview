package interview.guide.modules.exercise.service;

import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.exercise.dto.AddSheetQuestionRequest;
import interview.guide.modules.exercise.dto.CreateSheetRequest;
import interview.guide.modules.exercise.dto.ExerciseQuestionDTO;
import interview.guide.modules.exercise.dto.ExerciseSheetDTO;
import interview.guide.modules.exercise.dto.ExerciseSheetDetailDTO;
import interview.guide.modules.exercise.dto.SheetQuestionDTO;
import interview.guide.modules.exercise.dto.UpdateSheetRequest;
import interview.guide.modules.exercise.model.ExerciseQuestionPoolEntity;
import interview.guide.modules.exercise.model.ExerciseSheetEntity;
import interview.guide.modules.exercise.model.ExerciseSheetQuestionEntity;
import interview.guide.modules.exercise.repository.ExerciseQuestionPoolRepository;
import interview.guide.modules.exercise.repository.ExerciseSheetQuestionRepository;
import interview.guide.modules.exercise.repository.ExerciseSheetRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.stream.IntStream;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExerciseSheetService {

  private final ExerciseSheetRepository sheetRepository;
  private final ExerciseSheetQuestionRepository sheetQuestionRepository;
  private final ExerciseQuestionPoolRepository poolRepository;

  @Transactional(readOnly = true)
  public List<ExerciseSheetDTO> listSheets() {
    return sheetRepository.findAll().stream()
        .map(this::toSheetDTO)
        .toList();
  }

  @Transactional(readOnly = true)
  public ExerciseSheetDetailDTO getSheetDetail(Long sheetId) {
    ExerciseSheetEntity sheet = sheetRepository.findById(sheetId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_SHEET_NOT_FOUND, "题单不存在"));

    List<ExerciseSheetQuestionEntity> questions =
        sheetQuestionRepository.findBySheetIdOrderBySortOrderAsc(sheetId);

    List<SheetQuestionDTO> questionDTOs = questions.stream()
        .map(q -> new SheetQuestionDTO(q.getId(), q.getQuestion(), q.getReferenceAnswer(), q.getSortOrder()))
        .toList();

    return new ExerciseSheetDetailDTO(
        sheet.getId(), sheet.getName(), sheet.getTags(),
        questionDTOs, sheet.getCreatedAt(), sheet.getUpdatedAt());
  }

  @Transactional
  public ExerciseSheetDTO createSheet(CreateSheetRequest request) {
    ExerciseSheetEntity entity = ExerciseSheetEntity.builder()
        .name(request.name())
        .tags(request.tags())
        .build();
    entity = sheetRepository.save(entity);
    log.info("创建题单: id={}, name={}", entity.getId(), entity.getName());
    return toSheetDTO(entity);
  }

  @Transactional
  public ExerciseSheetDTO updateSheet(Long sheetId, UpdateSheetRequest request) {
    ExerciseSheetEntity sheet = sheetRepository.findById(sheetId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_SHEET_NOT_FOUND, "题单不存在"));
    sheet.setName(request.name());
    sheet.setTags(request.tags());
    sheet = sheetRepository.save(sheet);
    return toSheetDTO(sheet);
  }

  @Transactional
  public void deleteSheet(Long sheetId) {
    if (!sheetRepository.existsById(sheetId)) {
      throw new BusinessException(ErrorCode.EXERCISE_SHEET_NOT_FOUND, "题单不存在");
    }
    sheetQuestionRepository.deleteBySheetId(sheetId);
    sheetRepository.deleteById(sheetId);
    log.info("删除题单: id={}", sheetId);
  }

  @Transactional
  public SheetQuestionDTO addQuestionToSheet(Long sheetId, AddSheetQuestionRequest request) {
    ExerciseSheetEntity sheet = sheetRepository.findById(sheetId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_SHEET_NOT_FOUND, "题单不存在"));

    long count = sheetQuestionRepository.countBySheetId(sheetId);

    ExerciseSheetQuestionEntity entity = ExerciseSheetQuestionEntity.builder()
        .sheet(sheet)
        .question(request.question())
        .referenceAnswer(request.referenceAnswer())
        .sortOrder((int) count)
        .build();
    entity = sheetQuestionRepository.save(entity);

    return new SheetQuestionDTO(entity.getId(), entity.getQuestion(),
        entity.getReferenceAnswer(), entity.getSortOrder());
  }

  @Transactional
  public List<SheetQuestionDTO> addQuestionsToSheet(Long sheetId, List<AddSheetQuestionRequest> requests) {
    ExerciseSheetEntity sheet = sheetRepository.findById(sheetId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_SHEET_NOT_FOUND, "题单不存在"));

    long baseOrder = sheetQuestionRepository.countBySheetId(sheetId);

    List<ExerciseSheetQuestionEntity> entities = IntStream.range(0, requests.size())
        .mapToObj(i -> ExerciseSheetQuestionEntity.builder()
            .sheet(sheet)
            .question(requests.get(i).question())
            .referenceAnswer(requests.get(i).referenceAnswer())
            .sortOrder((int) (baseOrder + i))
            .build())
        .toList();

    entities = sheetQuestionRepository.saveAll(entities);

    return entities.stream()
        .map(e -> new SheetQuestionDTO(e.getId(), e.getQuestion(), e.getReferenceAnswer(), e.getSortOrder()))
        .toList();
  }

  @Transactional
  public void deleteQuestionFromSheet(Long sheetId, Long questionId) {
    ExerciseSheetQuestionEntity question = sheetQuestionRepository.findById(questionId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_QUESTION_NOT_FOUND, "题单问题不存在"));

    if (!question.getSheet().getId().equals(sheetId)) {
      throw new BusinessException(ErrorCode.EXERCISE_QUESTION_NOT_FOUND, "该问题不属于此题单");
    }

    sheetQuestionRepository.delete(question);
    log.info("删除题单问题: sheetId={}, questionId={}", sheetId, questionId);
  }

  @Transactional
  public void favoriteQuestionToSheet(Long questionId, Long sheetId) {
    ExerciseQuestionPoolEntity question = poolRepository.findById(questionId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_QUESTION_NOT_FOUND, "练习题不存在"));

    ExerciseSheetEntity sheet = sheetRepository.findById(sheetId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_SHEET_NOT_FOUND, "题单不存在"));

    long count = sheetQuestionRepository.countBySheetId(sheetId);

    ExerciseSheetQuestionEntity entity = ExerciseSheetQuestionEntity.builder()
        .sheet(sheet)
        .question(question.getQuestion())
        .referenceAnswer(question.getReferenceAnswer())
        .sortOrder((int) count)
        .build();
    sheetQuestionRepository.save(entity);

    log.info("收藏问题到题单: questionId={}, sheetId={}", questionId, sheetId);
  }

  @Transactional(readOnly = true)
  public List<ExerciseQuestionDTO> practiceFromSheet(Long sheetId, Integer count) {
    ExerciseSheetEntity sheet = sheetRepository.findById(sheetId)
        .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_SHEET_NOT_FOUND, "题单不存在"));

    List<ExerciseSheetQuestionEntity> questions =
        sheetQuestionRepository.findBySheetIdOrderBySortOrderAsc(sheetId);

    if (questions.isEmpty()) {
      throw new BusinessException(ErrorCode.EXERCISE_INSUFFICIENT_QUESTIONS, "题单中没有题目");
    }

    int takeCount = (count != null && count > 0) ? Math.min(count, questions.size()) : questions.size();

    // 随机抽取
    List<ExerciseSheetQuestionEntity> shuffled = new java.util.ArrayList<>(questions);
    Collections.shuffle(shuffled);
    List<ExerciseSheetQuestionEntity> taken = shuffled.subList(0, takeCount);

    return taken.stream()
        .map(q -> new ExerciseQuestionDTO(q.getId(), null, q.getQuestion(), null))
        .toList();
  }

  private ExerciseSheetDTO toSheetDTO(ExerciseSheetEntity entity) {
    long questionCount = sheetQuestionRepository.countBySheetId(entity.getId());
    return new ExerciseSheetDTO(entity.getId(), entity.getName(), entity.getTags(),
        (int) questionCount, entity.getCreatedAt(), entity.getUpdatedAt());
  }
}
