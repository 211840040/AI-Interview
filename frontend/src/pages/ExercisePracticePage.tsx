import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Loader2, BookOpen, Eye, EyeOff, Star, ChevronRight,
  Clock,
} from 'lucide-react';
import { exerciseApi } from '../api/exercise';
import type { ExerciseQuestionDTO, ExerciseSheetDTO } from '../types/exercise';
import { EXERCISE_DOMAINS } from '../constants/exerciseDomains';
import ConfirmDialog from '../components/ConfirmDialog';

const COOLDOWN_SECONDS = 5;

function getDomainLabel(key: string): string {
  return EXERCISE_DOMAINS.find((d) => d.key === key)?.label ?? key;
}

export default function ExercisePracticePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const domain = searchParams.get('domain') || '';
  const sheetId = searchParams.get('sheetId');

  // Current question
  const [question, setQuestion] = useState<ExerciseQuestionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const questionCountRef = useRef(0);

  // Answer
  const [userAnswer, setUserAnswer] = useState('');

  // Reference answer
  const [showAnswer, setShowAnswer] = useState(false);
  const [answerLoading, setAnswerLoading] = useState(false);

  // Cooldown timer
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Favorite dialog
  const [sheets, setSheets] = useState<ExerciseSheetDTO[]>([]);
  const [showFavDialog, setShowFavDialog] = useState(false);
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);
  const [favoriting, setFavoriting] = useState(false);

  // Sheet practice: store all questions (fetched upfront)
  const [sheetQuestions, setSheetQuestions] = useState<ExerciseQuestionDTO[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);

  const startCooldown = useCallback(() => {
    setCooldown(COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Fetch next question (domain practice)
  const fetchNextQuestion = useCallback(async () => {
    setLoading(true);
    setError('');
    setUserAnswer('');
    setShowAnswer(false);
    try {
      const data = await exerciseApi.fetchNextQuestion(domain);
      setQuestion(data);
      questionCountRef.current += 1;
      startCooldown();
    } catch (err: any) {
      setError(err.message || '获取题目失败');
    } finally {
      setLoading(false);
    }
  }, [domain, startCooldown]);

  // Initialize sheet practice: fetch all questions upfront
  const initSheetPractice = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    setError('');
    try {
      const data = await exerciseApi.practiceFromSheet(parseInt(sheetId, 10), 0);
      setSheetQuestions(data);
      setSheetIndex(0);
      setQuestion(data[0] || null);
      startCooldown();
    } catch (err: any) {
      setError(err.message || '获取题目失败');
    } finally {
      setLoading(false);
    }
  }, [sheetId, startCooldown]);

  // Initial load
  useEffect(() => {
    if (sheetId) {
      initSheetPractice();
    } else if (domain) {
      fetchNextQuestion();
    } else {
      setError('缺少参数');
      setLoading(false);
    }
  }, [domain, sheetId, fetchNextQuestion, initSheetPractice]);

  // Go to next question (sheet practice)
  const goToNextSheetQuestion = useCallback(() => {
    const nextIdx = sheetIndex + 1;
    if (nextIdx < sheetQuestions.length) {
      setSheetIndex(nextIdx);
      setQuestion(sheetQuestions[nextIdx]);
      setUserAnswer('');
      setShowAnswer(false);
      startCooldown();
    }
  }, [sheetIndex, sheetQuestions, startCooldown]);

  // Handle next question click
  const handleNext = () => {
    if (cooldown > 0) return;
    if (sheetId) {
      goToNextSheetQuestion();
    } else {
      fetchNextQuestion();
    }
  };

  const hasMore =
    sheetId
      ? sheetIndex < sheetQuestions.length - 1
      : true; // domain practice always has more (generated on demand)

  // Toggle answer
  const handleToggleAnswer = async () => {
    if (showAnswer) {
      setShowAnswer(false);
      return;
    }
    if (question?.referenceAnswer) {
      setShowAnswer(true);
      return;
    }
    if (!question) return;
    setAnswerLoading(true);
    try {
      const result = await exerciseApi.getAnswer(question.id);
      setQuestion((prev) =>
        prev ? { ...prev, referenceAnswer: result.referenceAnswer } : prev
      );
      setShowAnswer(true);
    } catch (err) {
      console.error('获取答案失败:', err);
    } finally {
      setAnswerLoading(false);
    }
  };

  // Favorite
  const handleOpenFavDialog = async () => {
    try {
      const list = await exerciseApi.listSheets();
      setSheets(list);
    } catch {
      setSheets([]);
    }
    setSelectedSheetId(null);
    setShowFavDialog(true);
  };

  const handleConfirmFavorite = async () => {
    if (!question || !selectedSheetId) return;
    setFavoriting(true);
    try {
      await exerciseApi.favoriteQuestion(question.id, selectedSheetId);
      setShowFavDialog(false);
    } catch (err) {
      console.error('收藏失败:', err);
    } finally {
      setFavoriting(false);
    }
  };

  if (!loading && error && !question) {
    return (
      <div className="max-w-3xl mx-auto">
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

  return (
    <div className="max-w-3xl mx-auto">
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
          {sheetId && sheetQuestions.length > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {sheetIndex + 1} / {sheetQuestions.length}
            </span>
          )}
        </div>
      </motion.div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700"
          >
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </motion.div>
        ) : question ? (
          <motion.div
            key={question.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 space-y-6"
          >
            {/* Question text */}
            <div className="flex items-start gap-3">
              <BookOpen className="w-5 h-5 text-primary-500 mt-1 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
                {question.question}
              </h3>
            </div>

            {/* Answer textarea */}
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="输入你的回答..."
              rows={8}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700
                bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white
                placeholder:text-slate-400 resize-vertical focus:outline-none focus:ring-2
                focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
            />

            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleToggleAnswer}
                disabled={answerLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                  bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300
                  hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {answerLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : showAnswer ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                {showAnswer ? '隐藏答案' : '查看答案'}
              </button>

              <button
                onClick={handleOpenFavDialog}
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
              {showAnswer && question.referenceAnswer && (
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
                      {question.referenceAnswer}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom bar: cooldown + next */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
              {cooldown > 0 ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                  <Clock className="w-4 h-4" />
                  <span>{cooldown}秒后可查看下一题</span>
                </div>
              ) : (
                <div />
              )}

              {sheetId && !hasMore ? (
                <button
                  onClick={() => navigate('/exercise-hub')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                    bg-green-500 text-white hover:bg-green-600 transition-colors"
                >
                  已完成全部题目
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <motion.button
                  onClick={handleNext}
                  disabled={cooldown > 0}
                  whileHover={cooldown === 0 ? { scale: 1.02 } : {}}
                  whileTap={cooldown === 0 ? { scale: 0.98 } : {}}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all
                    ${cooldown > 0
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm'
                    }`}
                >
                  下一题
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Favorite dialog */}
      <ConfirmDialog
        open={showFavDialog}
        title="收藏到题单"
        confirmText="确定收藏"
        confirmVariant="primary"
        loading={favoriting}
        onConfirm={handleConfirmFavorite}
        onCancel={() => setShowFavDialog(false)}
        message=""
        customContent={
          <div>
            {sheets.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                暂无题单，请先在练习中心创建题单
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sheets.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSheetId(s.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                      ${selectedSheetId === s.id
                        ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedSheetId === s.id ? 'bg-primary-100 dark:bg-primary-900/50' : 'bg-slate-100 dark:bg-slate-700'
                    }`}>
                      <BookOpen className={`w-4 h-4 ${
                        selectedSheetId === s.id ? 'text-primary-600' : 'text-slate-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className={`text-sm font-medium truncate ${
                        selectedSheetId === s.id ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {s.name}
                      </p>
                      <p className="text-xs text-slate-400">{s.questionCount} 题</p>
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
