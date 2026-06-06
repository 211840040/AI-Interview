import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Circle, Loader2,
  BookOpen, Star, Eye, EyeOff,
} from 'lucide-react';
import { exerciseApi } from '../api/exercise';
import type { ExerciseQuestionDTO, ExerciseSheetDTO } from '../types/exercise';
import { EXERCISE_DOMAINS } from '../constants/exerciseDomains';
import ConfirmDialog from '../components/ConfirmDialog';

/** 找到领域的中文名称 */
function getDomainLabel(key: string): string {
  return EXERCISE_DOMAINS.find((d) => d.key === key)?.label ?? key;
}

export default function ExercisePracticePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const domain = searchParams.get('domain') || '';
  const count = parseInt(searchParams.get('count') || '5', 10);
  const sheetId = searchParams.get('sheetId');

  // Questions state
  const [questions, setQuestions] = useState<ExerciseQuestionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Navigation & answers
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [showAnswers, setShowAnswers] = useState<Record<number, boolean>>({});
  const [loadingAnswers, setLoadingAnswers] = useState<Record<number, boolean>>({});

  // Favorite dialog
  const [sheets, setSheets] = useState<ExerciseSheetDTO[]>([]);
  const [showFavoriteDialog, setShowFavoriteDialog] = useState(false);
  const [favoriteTargetId, setFavoriteTargetId] = useState<number | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);
  const [favoriting, setFavoriting] = useState(false);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let data: ExerciseQuestionDTO[];
      if (sheetId) {
        data = await exerciseApi.practiceFromSheet(parseInt(sheetId, 10), count);
      } else if (domain) {
        data = await exerciseApi.fetchQuestions(domain, count);
      } else {
        setError('缺少领域参数');
        setLoading(false);
        return;
      }
      setQuestions(data);
      // Initialize answers state
      const initialShowAnswers: Record<number, boolean> = {};
      data.forEach((q) => {
        initialShowAnswers[q.id] = false;
        // If the question already has a reference answer, mark show ready
      });
      setShowAnswers(initialShowAnswers);
    } catch (err: any) {
      console.error('Failed to load questions:', err);
      setError(err.message || '加载题目失败');
    } finally {
      setLoading(false);
    }
  }, [domain, count, sheetId]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const handleToggleAnswer = async (questionId: number) => {
    if (showAnswers[questionId]) {
      setShowAnswers((prev) => ({ ...prev, [questionId]: false }));
      return;
    }

    // If answer already loaded, just show
    const question = questions.find((q) => q.id === questionId);
    if (question?.referenceAnswer) {
      setShowAnswers((prev) => ({ ...prev, [questionId]: true }));
      return;
    }

    // Load answer from API
    setLoadingAnswers((prev) => ({ ...prev, [questionId]: true }));
    try {
      const result = await exerciseApi.getAnswer(questionId);
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, referenceAnswer: result.referenceAnswer } : q))
      );
      setShowAnswers((prev) => ({ ...prev, [questionId]: true }));
    } catch (err: any) {
      console.error('Failed to load answer:', err);
    } finally {
      setLoadingAnswers((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const handleFavorite = async (questionId: number) => {
    // Load sheets list
    try {
      const sheetList = await exerciseApi.listSheets();
      setSheets(sheetList);
    } catch {
      setSheets([]);
    }
    setFavoriteTargetId(questionId);
    setSelectedSheetId(null);
    setShowFavoriteDialog(true);
  };

  const confirmFavorite = async () => {
    if (!favoriteTargetId || !selectedSheetId) return;
    setFavoriting(true);
    try {
      await exerciseApi.favoriteQuestion(favoriteTargetId, selectedSheetId);
      setShowFavoriteDialog(false);
      setFavoriteTargetId(null);
    } catch (err: any) {
      console.error('Failed to favorite:', err);
    } finally {
      setFavoriting(false);
    }
  };

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(userAnswers).filter(
    (k) => userAnswers[Number(k)]?.trim()
  ).length;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => navigate('/exercise-hub')}
              className="px-5 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              返回练习中心
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <BookOpen className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">暂无题目</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">该领域暂时没有可用题目</p>
          <button
            onClick={() => navigate('/exercise-hub')}
            className="px-5 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            返回练习中心
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Top bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <button
          onClick={() => navigate('/exercise-hub')}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 dark:text-slate-400
            hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800
            rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        <div className="flex items-center gap-3">
          {domain && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
              {getDomainLabel(domain)}
            </span>
          )}
          {sheetId && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              题单练习
            </span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {answeredCount}/{questions.length} 已答
          </span>
        </div>
      </motion.div>

      {/* Question navigation pills */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 mb-6"
      >
        <div className="flex items-center gap-2 overflow-x-auto">
          {questions.map((q, idx) => {
            const hasAnswer = !!userAnswers[q.id]?.trim();
            const isCurrent = idx === currentIndex;
            const showAns = showAnswers[q.id];
            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0
                  ${isCurrent
                    ? 'bg-primary-500 text-white shadow-sm'
                    : showAns
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : hasAnswer
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
              >
                {hasAnswer || showAns ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
                {idx + 1}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Current question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-6"
        >
          {/* Question card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
            <div className="flex items-start gap-3 mb-4">
              <BookOpen className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
                {currentQuestion.question}
              </h3>
            </div>

            <textarea
              value={userAnswers[currentQuestion.id] || ''}
              onChange={(e) =>
                setUserAnswers((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))
              }
              placeholder="输入你的回答..."
              rows={8}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700
                bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white
                placeholder:text-slate-400 resize-vertical focus:outline-none focus:ring-2
                focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => handleToggleAnswer(currentQuestion.id)}
              disabled={loadingAnswers[currentQuestion.id]}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300
                hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAnswers[currentQuestion.id] ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : showAnswers[currentQuestion.id] ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {showAnswers[currentQuestion.id] ? '隐藏答案' : '查看答案'}
            </button>

            <button
              onClick={() => handleFavorite(currentQuestion.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300
                hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              <Star className="w-4 h-4" />
              收藏本题
            </button>
          </div>

          {/* Reference answer */}
          <AnimatePresence>
            {showAnswers[currentQuestion.id] && currentQuestion.referenceAnswer && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      参考答案
                    </span>
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {currentQuestion.referenceAnswer}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
            border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300
            hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
          上一题
        </button>

        <span className="text-xs text-slate-400">
          {currentIndex + 1} / {questions.length}
        </span>

        <button
          onClick={() =>
            setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))
          }
          disabled={currentIndex === questions.length - 1}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
            border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300
            hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          下一题
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Favorite dialog */}
      <ConfirmDialog
        open={showFavoriteDialog}
        title="收藏到题单"
        message=""
        confirmText="确定收藏"
        confirmVariant="primary"
        loading={favoriting}
        onConfirm={confirmFavorite}
        onCancel={() => {
          setShowFavoriteDialog(false);
          setFavoriteTargetId(null);
        }}
        customContent={
          <div>
            {sheets.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                暂无题单，请先在练习中心创建题单
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sheets.map((sheet) => (
                  <button
                    key={sheet.id}
                    onClick={() => setSelectedSheetId(sheet.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                      ${selectedSheetId === sheet.id
                        ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedSheetId === sheet.id ? 'bg-primary-100 dark:bg-primary-900/50' : 'bg-slate-100 dark:bg-slate-700'
                    }`}>
                      <BookOpen className={`w-4 h-4 ${
                        selectedSheetId === sheet.id ? 'text-primary-600' : 'text-slate-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        selectedSheetId === sheet.id ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {sheet.name}
                      </p>
                      <p className="text-xs text-slate-400">{sheet.questionCount} 题</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
