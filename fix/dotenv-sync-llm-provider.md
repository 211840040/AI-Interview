# 问题：修改 .env 后数据库 `llm_provider_config` 未同步

## 背景

用户在 `.env` 中修改了 `AI_MODE`（对应 dashscope 的 model）和 `AI_BAILIAN_API_KEY`，重启后端后 `llm_provider_config` 表中的记录没有更新。

## 原因分析

`LlmProviderBootstrapService.seedProvidersIfNecessary()` 的 @PostConstruct 初始化逻辑有 bug：

1. **原逻辑：表不为空就跳过** — 首次启动时数据库为空，会从 `app.ai.providers` 配置 seed 写入表。后续重启时表中已有数据，`providerRepository.count() == 0` 为 false，直接跳过 seed，因此 `.env` 修改永远不进数据库。

2. **第一次修复（错误）** — 加了 `syncDotEnvProviders()` 方法，用 `startsWith("${")` 判断 model/apiKey 是否来自占位符。但 Spring Boot 的 `@ConfigurationProperties` 在属性绑定前已经解析了 `${...}` 占位符，`config.getModel()` 返回的是解析后的实际值（如 `qwen3.6-35b-a3b`），不再是 `${AI_MODEL}` 原文。所以条件永远不满足，同步代码被跳过。

## 解决过程

### 方案：白名单 + 内容比对

移除占位符检测，改用白名单 `Set.of("dashscope")` 指定哪些 provider 是由 `.env` 驱动的。然后比对 model 是否有变化，有变化才更新（避免每次启动都无谓写库）。

修改文件：`app/src/main/java/interview/guide/modules/llmprovider/service/LlmProviderBootstrapService.java`

**改动要点：**

1. 去掉 `if (providerRepository.count() == 0)` 的判断，改为 `if (empty) seedProviders() else syncDotEnvProviders()` 两条路径
2. `syncDotEnvProviders()` 加入白名单 `DOTENV_PROVIDERS`，目前仅包含 `"dashscope"`
3. 只对白名单内的 provider 执行同步
4. 比对 `modelValue.equals(entity.getModel())`，相同则跳过，减少无谓写入
5. 同步字段：model（来自 `AI_MODEL`）和 apiKey（来自 `AI_BAILIAN_API_KEY`，需加密后存储）

### 关键教训

- Spring Boot `@ConfigurationProperties` 中 `${...}` 占位符在属性绑定前已被 Environment 解析
- 运行时无法通过检查配置值来判断它是否来自占位符，只能用白名单
- `@PostConstruct` + `@Transactional` 可以安全地在 startup 时同步数据库

## 最终状态

启动日志可见：
```
Synced dotenv provider: id=dashscope, model=qwen3.6-35b-a3b
```
（如果 model 有变化）
或者：
```
[无输出，跳过]（model 未变化）
```
