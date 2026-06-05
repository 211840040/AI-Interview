# 专项练习模块 — 开发计划

## 阶段一：基础设施（数据模型 + 异常码）

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1.1 | 在 ErrorCode 中新增 12xxx 错误码 | `common/exception/ErrorCode.java` |
| 1.2 | 创建 ExerciseQuestionPoolEntity | `modules/exercise/model/ExerciseQuestionPoolEntity.java` |
| 1.3 | 创建 ExerciseQuestionHistoryEntity | `modules/exercise/model/ExerciseQuestionHistoryEntity.java` |
| 1.4 | 创建 ExerciseSheetEntity | `modules/exercise/model/ExerciseSheetEntity.java` |
| 1.5 | 创建 ExerciseSheetQuestionEntity | `modules/exercise/model/ExerciseSheetQuestionEntity.java` |
| 1.6 | 创建对应的 4 个 Repository | `modules/exercise/repository/*Repository.java` |

## 阶段二：Prompt + AI 生成服务

| 步骤 | 内容 | 文件 |
|------|------|------|
| 2.1 | 创建 prompt 模板文件 | `resources/prompts/exercise/generate-questions.st` |
| 2.2 | 实现 QuestionGeneratorService | `modules/exercise/service/QuestionGeneratorService.java` |

## 阶段三：专项练习核心服务

| 步骤 | 内容 | 文件 |
|------|------|------|
| 3.1 | 实现 ExerciseService（问题获取 + 缓存池管理） | `modules/exercise/service/ExerciseService.java` |
| 3.2 | 实现参考答案查看 + 收藏功能 | 同上 |

## 阶段四：题单功能

| 步骤 | 内容 | 文件 |
|------|------|------|
| 4.1 | 实现 ExerciseSheetService（题单 CRUD） | `modules/exercise/service/ExerciseSheetService.java` |
| 4.2 | 实现题单问题管理（增删 + 练习模式） | 同上 |

## 阶段五：DTO + Controller

| 步骤 | 内容 | 文件 |
|------|------|------|
| 5.1 | 创建所有 DTO（ExerciseQuestionDTO 等） | `modules/exercise/dto/` |
| 5.2 | 创建 ExerciseController | `modules/exercise/ExerciseController.java` |

## 阶段六：测试

| 步骤 | 内容 |
|------|------|
| 6.1 | 编译检查，确保无报错 |
| 6.2 | 启动应用，通过 curl/HTTP 测试所有接口 |
| 6.3 | 验证问题生成、缓存池补充、去重逻辑 |
| 6.4 | 验证题单 CRUD、收藏、练习模式 |

---

**依赖关系：** 阶段一 → 阶段二 → 阶段三 → 阶段五
                                      ↕
                                阶段四 → 阶段五

阶段六在所有阶段完成后执行。
