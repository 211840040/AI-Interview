import {Link, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {motion} from 'framer-motion';
import {BookOpen, FileStack, Moon, Sparkles, Sun, Users} from 'lucide-react';
import {useTheme} from '../hooks/useTheme';
import {useState} from 'react';
import UnifiedInterviewModal, {UnifiedInterviewConfig} from './UnifiedInterviewModal';

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export default function Layout() {
  const location = useLocation();
  const currentPath = location.pathname;
  const {theme, toggleTheme} = useTheme();
  const navigate = useNavigate();
  const [interviewModalPreset, setInterviewModalPreset] = useState<{
    defaultMode: 'text' | 'voice';
    defaultResumeId?: number;
    title: string;
    subtitle: string;
    startButtonText: string;
  } | null>(null);

  const openInterviewModalWithResume = (resumeId: number) => {
    setInterviewModalPreset({
      defaultMode: 'text',
      defaultResumeId: resumeId,
      title: '开始模拟面试',
      subtitle: '配置面试参数，开始练习',
      startButtonText: '开始面试',
    });
  };

  const handleInterviewStart = (config: UnifiedInterviewConfig) => {
    setInterviewModalPreset(null);
    if (config.mode === 'text') {
      navigate('/interview', {
        state: {
          resumeId: config.resumeId,
          interviewConfig: {
            skillId: config.skillId,
            difficulty: config.difficulty,
            questionCount: config.questionCount,
            llmProvider: config.llmProvider,
          },
        },
      });
      return;
    }

    const params = new URLSearchParams({
      skillId: config.skillId,
      difficulty: config.difficulty,
    });
    navigate(`/voice-interview?${params.toString()}`, {
      state: {
        voiceConfig: {
          skillId: config.skillId,
          difficulty: config.difficulty,
          techEnabled: true,
          projectEnabled: true,
          hrEnabled: true,
          plannedDuration: config.plannedDuration,
          resumeId: config.resumeId,
          llmProvider: config.llmProvider,
        },
      },
    });
  };

  const navItems: NavItem[] = [
    { id: 'resumes', path: '/history', label: '简历管理', icon: FileStack },
    { id: 'interview-hub', path: '/interview-hub', label: '模拟面试', icon: Sparkles },
    { id: 'interviews', path: '/interviews', label: '面试记录', icon: Users },
    { id: 'exercise-hub', path: '/exercise-hub', label: '专项练习', icon: BookOpen },
  ];

  const isActive = (path: string) => {
    if (path.startsWith('#')) return false;
    if (path === '/history') {
      return currentPath === '/history'
        || currentPath === '/'
        || currentPath.startsWith('/history/')
        || currentPath === '/upload';
    }
    if (path === '/interview-hub') {
      return currentPath === '/interview-hub'
        || currentPath === '/interview'
        || currentPath.startsWith('/interview/')
        || currentPath.startsWith('/voice-interview');
    }
    if (path === '/exercise-hub') {
      return currentPath === '/exercise-hub'
        || currentPath.startsWith('/exercise/');
    }
    return currentPath.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
      {/* 顶部导航栏 — 毛玻璃效果 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/history" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-primary-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-base font-bold text-slate-800 dark:text-white tracking-tight hidden sm:block">
              AI Interview
            </span>
          </Link>

          {/* 导航项 */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.path);

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                    ${active
                      ? 'text-primary-600 dark:text-primary-400 bg-primary-50/80 dark:bg-primary-900/20'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                    }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                  {/* 激活指示器 — 底部滑动条 */}
                  {active && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute -bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-primary-400 to-primary-500 rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* 主内容区 — pt-16 为顶部导航栏留出空间 */}
      <main className="pt-16 min-h-screen">
        <motion.div
          key={currentPath}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="p-6 sm:p-10"
        >
          <Outlet context={{ openInterviewModalWithResume }} />
        </motion.div>
      </main>

      {/* 统一面试弹窗 */}
      <UnifiedInterviewModal
        isOpen={interviewModalPreset !== null}
        onClose={() => setInterviewModalPreset(null)}
        onStart={handleInterviewStart}
        defaultMode={interviewModalPreset?.defaultMode || 'text'}
        defaultResumeId={interviewModalPreset?.defaultResumeId}
        hideModeSwitch={interviewModalPreset?.defaultResumeId == null}
        title={interviewModalPreset?.title || '开始模拟面试'}
        subtitle={interviewModalPreset?.subtitle || '选择面试模式和主题，快速开始'}
        startButtonText={interviewModalPreset?.startButtonText || '开始面试'}
      />
    </div>
  );
}