# 模拟面试页面重构设计文档

## 1. 概述

对 `frontend/src/pages/InterviewHubPage.tsx`（模拟面试配置页）进行信息布局、视觉一致性、交互体验三个维度的优化，提升用户配置效率与页面美观度。

### 涉及文件

| 文件 | 改动类型 |
|------|----------|
| `frontend/src/pages/InterviewHubPage.tsx` | 重构 |
| `frontend/src/hooks/useInterviewConfig.ts` | 新增 `localStorage` 持久化 |
| `frontend/src/utils/skillIcons.ts` | 补充方向图标 |

---

## 2. 修改方案

### 2.1 信息布局与结构优化

#### 2.1.1 步骤条引导

将配置过程划分为 4 个步骤，顶部展示步骤条：

```
[1️⃣ 选模式] → [2️⃣ 选方向] → [3️⃣ 设难度 + 题量] → [4️⃣ 开始面试]
```

- 已完成步骤显示 ✓ 勾号
- 当前步骤高亮
- 未完成步骤灰色
- 步骤条固定在页面顶部（sticky），滚动时可见

#### 2.1.2 "开始面试"按钮固定在底部

- 配置区域滚动时，"开始面试"按钮固定在页面底部（`position: sticky; bottom: 0`）
- 使用白色背景 + 顶部浅阴影分隔，不遮挡内容
- 放大按钮尺寸（`py-4`），使用渐变色

#### 2.1.3 精简冗余文字

- 模式选项（文字/语音）下方的说明文字改为 tooltip 或浅色小字（`text-xs text-slate-400`），不再平铺
- "推荐"标签保留，但改为浅色徽章

#### 2.1.4 突出自定义 JD 入口

- 自定义 JD 从技能网格中移出，改为独立的区域卡片
- 位于技能选择区下方，使用虚线边框 + "📝 填写专属职位描述" 引导文案
- 点击后展开 JD 输入面板

---

### 2.2 视觉美观与一致性提升

#### 2.2.1 卡片与阴影规范

每个配置区块使用独立的卡片背景：

```
bg-white dark:bg-slate-800 
rounded-xl 
shadow-sm 
border border-slate-100 dark:border-slate-700
```

区块之间用 `gap-4` 分隔，替代大面积留白。

#### 2.2.2 选中态增强

选中项增加多层次反馈：
- 边框高亮：`border-primary-500` + `ring-2 ring-primary-500/20`
- 背景变化：`bg-primary-50/80 dark:bg-primary-900/20`
- 勾选图标：选中项显示 ✓ 图标
- 内阴影叠加：`shadow-inner` 微效果

#### 2.2.3 方向图标补充

当前通过 `getSkillIcon()` 返回组件。需要为预设方向补充专属图标：

| 方向 ID | 图标 |
|---------|------|
| `java-backend` | Coffee |
| `frontend` | Globe |
| `algorithm` | Code |
| `go-backend` | 已有 Terminal |
| `python-backend` | 已有 Terminal |
| ... 其他 | 保持现有逻辑 |

#### 2.2.4 分割线

区块之间使用细腻分割线：
```
<div class="border-t border-slate-100 dark:border-slate-700 my-2" />
```
替代单纯靠间距 `mb-8` 的方式。

#### 2.2.5 按钮视觉层级

- "开始面试"：渐变色 + 大尺寸 + 品牌蓝
- "更多选项"：文字链形式（无背景，仅文字 + 图标），不喧宾夺主

---

### 2.3 交互细节与用户引导

#### 2.3.1 难度与题量并排

- 难度选择（3 列）与题量选择（4 按钮）放在同一行/grid 中
- 使用 `grid-cols-7` 或两行布局减少纵向滚动

#### 2.3.2 "立即上传简历"入口

在简历选择下拉框下方，新增一个跳转链接：
```
[📄 立即上传简历] → 跳转到 /history（简历管理页面）
```
仅在简历列表为空时显示。

---

### 2.4 行为引导与效率提升

#### 2.4.1 步骤式引导

配置过程划分为：

```
Step 1: 选择面试模式（文字/语音）
Step 2: 选择面试方向（预设方向 / 自定义 JD）
Step 3: 配置难度与题量
Step 4: 开始面试
```

- 每个步骤独立卡片
- 步骤条显示整体进度
- 当前步骤与下一步之间用箭头或分割线连接

#### 2.4.2 最近配置持久化

使用 `localStorage` 记住用户最近一次选择：

| Key | 值 |
|-----|-----|
| `interview-mode` | `'text' | 'voice'` |
| `interview-skillId` | `string` |
| `interview-difficulty` | `'junior' | 'mid' | 'senior'` |
| `interview-questionCount` | `number` |
| `interview-plannedDuration` | `number` |

- 页面加载时读取 `localStorage` 初始化配置
- 每次用户修改配置时写入 `localStorage`
- 在 `useInterviewConfig` hook 中实现

---

## 3. 数据结构变更

### `useInterviewConfig` 新增

```typescript
// localStorage 持久化
const STORAGE_KEY_PREFIX = 'interview-';

function loadSavedConfig<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + key);
    return saved !== null ? JSON.parse(saved) : fallback;
  } catch { return fallback; }
}

function saveConfig<T>(key: string, value: T): void {
  localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(value));
}
```

初始化时从 localStorage 读取，setXxx 时同时写入 localStorage。

### `InterviewConfigState` 接口

接口无需新增字段，但增加 `loadSavedConfig`/`saveConfig` 辅助函数。

---

## 4. 页面布局示意图

```
┌─────────────────────────────────────────┐
│ [步骤条] ①选模式 ✓ → ②选方向 → ③配置 → ④开始 │  ← sticky
├─────────────────────────────────────────┤
│  ┌─ 卡片1: 面试模式 ──────────────────┐  │
│  │  [文字面试]  [语音面试]              │  │
│  │  (浅色说明文字)                      │  │
│  └────────────────────────────────────┘  │
│                                         │
│  ┌─ 卡片2: 面试方向 ──────────────────┐  │
│  │  [Java] [前端] [Go] ... [自定义JD] │  │
│  │  ┌─ 自定义JD展开 ──────────────┐   │  │
│  │  │ textarea + 解析按钮          │   │  │
│  │  └──────────────────────────────┘   │  │
│  └────────────────────────────────────┘  │
│                                         │
│  ┌─ 卡片3: 难度与配置 ────────────────┐  │
│  │  难度: [校招] [中级] [高级]        │  │
│  │  题量: [6] [8] [10] [12]           │  │
│  │  [📄 立即上传简历] (可选)          │  │
│  └────────────────────────────────────┘  │
│                                         │
│  [更多选项 ▼] (文字链)                  │
│   ┌─ 展开: 简历选择 / 语音时长 ──────┐  │
│   │  ...                              │  │
│   └────────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  [✨ 开始文字面试]                      │  ← sticky bottom
└─────────────────────────────────────────┘
```

---

## 5. 实现顺序

| # | 任务 | 估计 |
|---|------|------|
| 1 | `useInterviewConfig` 增加 localStorage 持久化 | 10min |
| 2 | 步骤条组件（StepsBar） | 15min |
| 3 | 重新布局：卡片化各配置区块 + 开始按钮粘底 | 20min |
| 4 | 选中态增强（勾选图标 + ring + shadow） | 10min |
| 5 | 自定义 JD 移出为独立区域卡片 | 10min |
| 6 | 难度与题量并排 | 5min |
| 7 | "立即上传简历"入口 | 5min |
| 8 | 精简冗余文字 + 分割线替代间距 | 10min |
| 9 | 方向图标补充 | 10min |
| 10 | 全局检查与微调 | 10min |

---

## 6. 风险与注意事项

- `localStorage` 写入应防抖（用户切换选项时频繁写入可能影响性能）
- 步骤条不应阻止用户跳步骤选择（仅做可视化引导，不做强制顺序）
- 兼容深色模式（所有新增样式需 `dark:` 变体）
- 兼容 `UnifiedInterviewModal`（侧边栏 modal 版本保持独立，不受本设计影响）\"立即上传简历\"入口 | 5min |\n| 8 | 精简冗余文字 + 分割线替代间距 | 10min |\n| 9 | 方向图标补充 | 10min |\n| 10 | 全局检查与微调 | 10min |\n\n---\n\n## 6. 风险与注意事项\n\n- `localStorage` 写入应防抖（用户切换选项时频繁写入可能影响性能）\n- 步骤条不应阻止用户跳步骤选择（仅做可视化引导，不做强制顺序）\n- 兼容深色模式（所有新增样式需 `dark:` 变体）\n- 兼容 `UnifiedInterviewModal`（侧边栏 modal 版本保持独立，不受本设计影响）\n"