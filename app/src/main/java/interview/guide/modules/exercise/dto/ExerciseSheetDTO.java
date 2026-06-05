package interview.guide.modules.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExerciseSheetDTO(
    Long id,
    String name,
    String tags,
    Integer questionCount,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {}
