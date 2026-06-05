package interview.guide.modules.exercise.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record GeneratedQuestionDTO(
    @JsonProperty("question") String question,
    @JsonProperty("referenceAnswer") String referenceAnswer
) {}
