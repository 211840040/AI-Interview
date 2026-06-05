package interview.guide.modules.exercise.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ExerciseSheetDetailDTO(
    Long id,
    String name,
    String tags,
    List<SheetQuestionDTO> questions,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {}
