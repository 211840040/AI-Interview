import type { ExerciseDomain } from '../types/exercise';

export const EXERCISE_DOMAINS: ExerciseDomain[] = [
  { key: 'java', label: 'Java 基础', icon: '☕' },
  { key: 'database', label: '数据库概论', icon: '🗄️' },
  { key: 'mysql', label: 'MySQL', icon: '🐬' },
  { key: 'redis', label: 'Redis', icon: '📡' },
  { key: 'spring', label: 'Spring', icon: '🍃' },
  { key: 'distributed', label: '分布式系统', icon: '🌐' },
  { key: 'mq', label: '消息队列', icon: '📨' },
  { key: 'network-os', label: '网络与操作系统', icon: '🖥️' },
  { key: 'browser', label: '浏览器原理', icon: '🌍' },
  { key: 'javascript', label: 'JavaScript', icon: '📜' },
  { key: 'react-vue', label: '前端框架', icon: '⚛️' },
  { key: 'algorithm-data-structures', label: '算法与数据结构', icon: '🔢' },
  { key: 'design-pattern', label: '设计模式', icon: '🔧' },
  { key: 'system-design-scenarios', label: '系统设计场景', icon: '🏗️' },
  { key: 'python-basic', label: 'Python 基础', icon: '🐍' },
  { key: 'django-flask', label: 'Django 与 Flask', icon: '🌶️' },
  { key: 'test-development', label: '测试开发', icon: '🧪' },
  { key: 'high-availability', label: '高可用架构', icon: '⚡' },
  { key: 'db-design', label: '数据库设计', icon: '📐' },
  { key: 'ai-agent-dev', label: 'AI Agent 开发', icon: '🤖' },
];

export const QUESTION_COUNTS = [3, 5, 10, 15];
