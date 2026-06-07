package interview.guide.modules.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SheetQuestionDTO(
    Long id,
    String question,
    String referenceAnswer,
    Integer sortOrder
) {}
