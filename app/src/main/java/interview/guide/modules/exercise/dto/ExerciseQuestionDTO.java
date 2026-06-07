package interview.guide.modules.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExerciseQuestionDTO(
    Long id,
    String domain,
    String question,
    String referenceAnswer
) {}
