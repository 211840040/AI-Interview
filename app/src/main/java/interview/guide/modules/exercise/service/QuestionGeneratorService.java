package interview.guide.modules.exercise.service;

import interview.guide.common.ai.LlmProviderRegistry;
import interview.guide.common.ai.StructuredOutputInvoker;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.exercise.dto.GeneratedQuestionDTO;
import interview.guide.modules.exercise.dto.GeneratedQuestionsWrapper;
import interview.guide.modules.exercise.model.ExerciseQuestionHistoryEntity;
import interview.guide.modules.exercise.repository.ExerciseQuestionHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class QuestionGeneratorService {

  private static final String SYSTEM_PROMPT_PATH = "classpath:prompts/exercise/generate-questions-system.st";
  private static final String USER_PROMPT_PATH = "classpath:prompts/exercise/generate-questions-user.st";
  private static final String REFERENCE_PATH_PREFIX = "classpath:skills/_shared/references/";
  private static final int MAX_REFERENCE_CHARS = 8000;

  private final LlmProviderRegistry llmProviderRegistry;
  private final StructuredOutputInvoker structuredOutputInvoker;
  private final ExerciseQuestionHistoryRepository historyRepository;
  private final ResourceLoader resourceLoader;

  public List<GeneratedQuestionDTO> generateQuestions(String domain, int count) {
    String referenceContent = loadReferenceContent(domain);
    String recentQuestions = loadRecentQuestions(domain);

    String systemPrompt = loadPrompt(SYSTEM_PROMPT_PATH);
    String userPromptTemplate = loadPrompt(USER_PROMPT_PATH);

    Map<String, Object> variables = new HashMap<>();
    variables.put("domain", domain);
    variables.put("count", count);
    variables.put("referenceContent", referenceContent);
    variables.put("recentQuestions", recentQuestions);

    String userPrompt = new PromptTemplate(userPromptTemplate).render(variables);

    ChatClient chatClient = llmProviderRegistry.getChatClientOrDefault(null);

    BeanOutputConverter<GeneratedQuestionsWrapper> converter =
        new BeanOutputConverter<>(GeneratedQuestionsWrapper.class);

    String systemWithFormat = systemPrompt + "\n\n" + converter.getFormat();

    GeneratedQuestionsWrapper wrapper = structuredOutputInvoker.invoke(
        chatClient, systemWithFormat, userPrompt, converter,
        ErrorCode.EXERCISE_QUESTION_GENERATION_FAILED,
        "AI 生成题目失败：", "专项练习题目生成", log);

    List<GeneratedQuestionDTO> questions = wrapper.questions();
    log.info("AI 生成 {} 领域 {} 道题目，成功解析 {} 道", domain, count, questions.size());
    return questions;
  }

  private String loadReferenceContent(String domain) {
    String path = REFERENCE_PATH_PREFIX + domain + ".md";
    try {
      var resource = resourceLoader.getResource(path);
      if (!resource.exists()) {
        log.warn("领域参考文档不存在: {}", path);
        return "无参考文档";
      }
      String content = resource.getContentAsString(StandardCharsets.UTF_8);
      if (content.length() > MAX_REFERENCE_CHARS) {
        return content.substring(0, MAX_REFERENCE_CHARS) + "\n...（已截断）";
      }
      return content;
    } catch (IOException e) {
      log.warn("读取参考文档失败: {}", path, e);
      return "无参考文档";
    }
  }

  private String loadRecentQuestions(String domain) {
    List<ExerciseQuestionHistoryEntity> recent =
        historyRepository.findTop20ByDomainOrderByFetchedAtDesc(domain);

    if (recent.isEmpty()) {
      return "无近期题目";
    }

    return recent.stream()
        .map(h -> "- " + h.getQuestion())
        .collect(Collectors.joining("\n"));
  }

  private String loadPrompt(String path) {
    try {
      var resource = resourceLoader.getResource(path);
      return resource.getContentAsString(StandardCharsets.UTF_8);
    } catch (IOException e) {
      log.error("加载 prompt 模板失败: {}", path, e);
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, "加载 prompt 模板失败");
    }
  }
}
