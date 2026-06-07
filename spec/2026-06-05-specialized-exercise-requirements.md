## 专项练习详细需求说明

### 总体概述

- 系统新增专项练习功能，用户可以选择专门的八股知识点领域(例如Java，Agent，数据库等等)进行八股问答练习，系统通过大模型随机生成相应领域的问题以及参考答案，用户回答后，显示参考答案。
- 用户可以自己创建题单，自己创建相应问题以及答案。用户可以选择收藏专项练习的问题到题单。
- 提单具有练习功能，系统从用户题单中抽取问题给用户回答。

### 问题生成

- 通过大模型自动生成问题，知识点领域使用app\src\main\resources\skills\_shared下的参考markdown
- 为减少大模型生成过程中的用户等待时间，可以让大模型批量生成问题（维护一个问题缓存列表），列表不足时后台再通过大模型自动补充
- 近期的问题应尽量不重复

### 问题回答

- 用户可以通过文字输入回答问题，回答提交后或点击“参考答案”直接显示答案
- 用户可以收藏问题到指定题单
- 后续需求：用户可以通过实时语音识别回答问题

### 题单功能

- 用户可以自己创建题单，包括命名，设置标签
- 用户可以自定义问题以及参考答案到题单中
- 提单具有练习功能，系统从系统从用户题单中抽取问题给用户回答，与专项练习的问题回答使用同一个页面

### 代码开发要求

- 在app\src\main\java\interview\guide\modules下新建模块exercise，尽量不修改已有代码，但可以复用已有代码，列如app\src\main\java\interview\guide\common下的通用功能
- 问题生成在app\src\main\resources\prompts下创建prompt
- 先完成后端流程与接口开发，并通过测试，后续再讨论前端页面设计
  
### 题目缓存池具体设计

使用数据库表作为缓存池，对外提供统一的api用于获取题目 GET /api/exercise/question/next?domain={domain}

以下说明中，所有题目已通过domain进行筛选

question有几个重要字段: done_cnt：完成次数，countdown：冷却计时

## 缓存池使用过程

- 当缓存池中无题目时，调用大模型生成INITIAL_QA_NUMS道题目，并将这些题的完成次数(done_cnt)标记为0
- 当无done_cnt>0的题目时，从未完成的题目(done_cnt=0)中均匀抽取；否则有DONE_PROB的概率从done_cnt>0的题目中抽取，每道题被抽到的权重为done_cnt/sum(done_cnt)
- 当done_cnt=0的题目数量小于等于SUPPLY_THRESHOLD时，后台调用大模型生成QA_PATCH_NUMS道题目补充到缓存池中，done_cnt均为0
- 当一道题目被抽取后，done_cnt自增1，countdown设为3
- countdown大于0的题目不可能被抽取(也不参与计算权重)，每当题目被抽取时，所有countdown>0的题目的countdown减一

## 其他事项

- 大模型生成的题目应当尽可能不与所有done_cnt=0的题目重复
- 当该领域下的题目数量大于等于MAX_QA_NUMS时，删除done_cnt最大的MAX_QA_NUMS/2道题目

## 参数设置

- INITIAL_QA_NUMS: 8
- DONE_PROB: 0.8
- SUPPLY_THRESHOLD: 5
- QA_PATCH_NUMS: 5
- MAX_QA_NUMS: 50