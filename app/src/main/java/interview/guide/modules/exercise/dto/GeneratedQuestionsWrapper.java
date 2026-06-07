package interview.guide.modules.exercise.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record GeneratedQuestionsWrapper(
    @JsonProperty("questions") List<GeneratedQuestionDTO> questions
) {}
