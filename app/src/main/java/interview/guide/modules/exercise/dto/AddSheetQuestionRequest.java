package interview.guide.modules.exercise.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AddSheetQuestionRequest(
    @JsonProperty("question") String question,
    @JsonProperty("referenceAnswer") String referenceAnswer
) {}
