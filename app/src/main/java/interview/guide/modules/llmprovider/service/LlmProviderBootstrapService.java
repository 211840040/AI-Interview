package interview.guide.modules.llmprovider.service;

import interview.guide.common.config.LlmProviderProperties;
import interview.guide.common.config.LlmProviderProperties.ProviderConfig;
import interview.guide.modules.llmprovider.model.LlmGlobalSettingEntity;
import interview.guide.modules.llmprovider.model.LlmProviderEntity;
import interview.guide.modules.llmprovider.repository.LlmGlobalSettingRepository;
import interview.guide.modules.llmprovider.repository.LlmProviderRepository;
import jakarta.annotation.PostConstruct;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class LlmProviderBootstrapService {

  private final LlmProviderProperties properties;
  private final LlmProviderRepository providerRepository;
  private final LlmGlobalSettingRepository globalSettingRepository;
  private final ApiKeyEncryptionService encryptionService;

  @PostConstruct
  @Transactional
  public void seedProvidersIfNecessary() {
    if (providerRepository.count() == 0) {
      seedProviders();
    }
    else {
      syncDotEnvProviders();
    }
    ensureGlobalSetting();
  }

  /**
   * On every startup, sync dotenv-driven fields for providers whose application.yml
   * uses ${...} placeholders. Spring resolves placeholders to actual values,
   * so we check whether the config model contains a known dotenv var name as a
   * hint — but that won't work after resolution.
   *
   * Instead, we maintain a whitelist of providers that are configured via .env
   * placeholders, and always sync them on startup.
   */
  private static final Set<String> DOTENV_PROVIDERS = Set.of("dashscope");

  private void syncDotEnvProviders() {
    Map<String, ProviderConfig> providers = properties.getProviders();
    if (providers == null || providers.isEmpty()) {
      return;
    }

    for (Map.Entry<String, ProviderConfig> entry : providers.entrySet()) {
      String id = entry.getKey();
      ProviderConfig config = entry.getValue();
      if (!DOTENV_PROVIDERS.contains(id)) {
        continue;
      }
      if (config == null || isBlank(config.getModel())) {
        continue;
      }

      String modelValue = config.getModel();
      String apiKeyValue = config.getApiKey();

      providerRepository.findById(id).ifPresentOrElse(entity -> {
        if (modelValue.equals(entity.getModel())) {
          return;
        }
        ApiKeyEncryptionService.EncryptedValue encrypted =
            encryptionService.encrypt(apiKeyValue != null ? apiKeyValue : "");
        entity.setApiKeyNonce(encrypted.nonce());
        entity.setApiKeyCiphertext(encrypted.ciphertext());
        entity.setModel(modelValue);
        providerRepository.save(entity);
        log.info("Synced dotenv provider: id={}, model={}", id, modelValue);
      }, () -> {
        ApiKeyEncryptionService.EncryptedValue encrypted =
            encryptionService.encrypt(apiKeyValue != null ? apiKeyValue : "");
        boolean supportsEmbedding = Boolean.TRUE.equals(config.getSupportsEmbedding())
            || !isBlank(config.getEmbeddingModel());
        LlmProviderEntity entity = LlmProviderEntity.builder()
            .id(id)
            .baseUrl(config.getBaseUrl())
            .apiKeyNonce(encrypted.nonce())
            .apiKeyCiphertext(encrypted.ciphertext())
            .model(modelValue)
            .embeddingModel(trimOrNull(config.getEmbeddingModel()))
            .embeddingDimensions(resolveEmbeddingDimensions(config.getEmbeddingDimensions()))
            .supportsEmbedding(supportsEmbedding)
            .temperature(config.getTemperature())
            .enabled(true)
            .builtin(true)
            .build();
        providerRepository.save(entity);
        log.info("Created missing dotenv provider: id={}", id);
      });
    }
  }

  private void seedProviders() {
    Map<String, ProviderConfig> providers = properties.getProviders();
    if (providers == null || providers.isEmpty()) {
      log.warn("No app.ai.providers seed configuration found");
      return;
    }

    providers.forEach((id, config) -> {
      if (isBlank(id) || config == null || isBlank(config.getBaseUrl()) || isBlank(config.getModel())) {
        log.warn("Skip invalid provider seed: id={}", id);
        return;
      }
      ApiKeyEncryptionService.EncryptedValue encrypted =
          encryptionService.encrypt(config.getApiKey() != null ? config.getApiKey() : "");
      boolean supportsEmbedding = Boolean.TRUE.equals(config.getSupportsEmbedding())
          || !isBlank(config.getEmbeddingModel());

      LlmProviderEntity entity = LlmProviderEntity.builder()
          .id(id)
          .baseUrl(config.getBaseUrl())
          .apiKeyNonce(encrypted.nonce())
          .apiKeyCiphertext(encrypted.ciphertext())
          .model(config.getModel())
          .embeddingModel(trimOrNull(config.getEmbeddingModel()))
          .embeddingDimensions(resolveEmbeddingDimensions(config.getEmbeddingDimensions()))
          .supportsEmbedding(supportsEmbedding)
          .temperature(config.getTemperature())
          .enabled(true)
          .builtin(true)
          .build();
      providerRepository.save(entity);
    });
    log.info("Seeded {} LLM providers from application configuration", providerRepository.count());
  }

  private void ensureGlobalSetting() {
    if (globalSettingRepository.existsById(LlmGlobalSettingEntity.SINGLETON_ID)) {
      return;
    }
    String defaultChatProvider = resolveExistingProvider(
        properties.getDefaultProvider(),
        providerRepository.findAll().stream().findFirst().map(LlmProviderEntity::getId).orElse("dashscope")
    );
    String configuredEmbeddingProvider = !isBlank(properties.getDefaultEmbeddingProvider())
        ? properties.getDefaultEmbeddingProvider()
        : defaultChatProvider;
    String defaultEmbeddingProvider = resolveExistingEmbeddingProvider(configuredEmbeddingProvider, defaultChatProvider);

    globalSettingRepository.save(LlmGlobalSettingEntity.builder()
        .id(LlmGlobalSettingEntity.SINGLETON_ID)
        .defaultChatProviderId(defaultChatProvider)
        .defaultEmbeddingProviderId(defaultEmbeddingProvider)
        .build());
    log.info("Initialized LLM global setting: chatProvider={}, embeddingProvider={}",
        defaultChatProvider, defaultEmbeddingProvider);
  }

  private String resolveExistingProvider(String preferredProvider, String fallbackProvider) {
    if (!isBlank(preferredProvider) && providerRepository.existsById(preferredProvider)) {
      return preferredProvider;
    }
    return fallbackProvider;
  }

  private String resolveExistingEmbeddingProvider(String preferredProvider, String fallbackProvider) {
    return providerRepository.findById(preferredProvider)
        .filter(this::canProvideEmbedding)
        .map(LlmProviderEntity::getId)
        .orElseGet(() -> providerRepository.findAll().stream()
            .filter(this::canProvideEmbedding)
            .findFirst()
            .map(LlmProviderEntity::getId)
            .orElse(fallbackProvider));
  }

  private boolean canProvideEmbedding(LlmProviderEntity provider) {
    return provider.isEnabled()
        && provider.isSupportsEmbedding()
        && !isBlank(provider.getEmbeddingModel());
  }

  private Integer resolveEmbeddingDimensions(Integer configuredDimensions) {
    if (configuredDimensions != null && configuredDimensions > 0) {
      return configuredDimensions;
    }
    return properties.getEmbeddingDimensions();
  }

  private String trimOrNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
