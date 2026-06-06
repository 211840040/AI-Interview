import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, BookOpen, Play, Plus, Trash2, Edit3,
  Loader2, Eye, EyeOff,
} from 'lucide-react';
import { exerciseApi } from '../api/exercise';
import type { ExerciseSheetDetailDTO, SheetQuestionDTO } from '../types/exercise';
import ConfirmDialog from '../components/ConfirmDialog';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';

export default function ExerciseSheetDetailPage() {
  const { sheetId } = useParams<{ sheetId: string }>();
  const navigate = useNavigate();

  const [sheet, setSheet] = useState<ExerciseSheetDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Expand answer
  const [expandedAnswers, setExpandedAnswers] = useState<Record<number, boolean>>({});

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editing, setEditing] = useState(false);

  // Delete sheet
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add question dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [adding, setAdding] = useState(false);

  // Delete question
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<SheetQuestionDTO | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState(false);

  const loadSheet = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    setError('');
    try {
      const data = await exerciseApi.getSheetDetail(parseInt(sheetId, 10));
      setSheet(data);
    } catch (err: any) {
      console.error('Failed to load sheet:', err);
      setError(err.message || '加载题单失败');
    } finally {
      setLoading(false);
    }
  }, [sheetId]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  const handleEdit = async () => {
    if (!sheet || !editName.trim()) return;
    setEditing(true);
    try {
      await exerciseApi.updateSheet(sheet.id, { name: editName.trim(), tags: editTags.trim() || undefined });
      setShowEditDialog(false);
      await loadSheet();
    } catch (err) {
      console.error('Failed to update sheet:', err);
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!sheet) return;
    setDeleting(true);
    try {
      await exerciseApi.deleteSheet(sheet.id);
      navigate('/exercise-hub');
    } catch (err) {
      console.error('Failed to delete sheet:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!sheet || !newQuestion.trim()) return;
    setAdding(true);
    try {
      await exerciseApi.addSheetQuestions(sheet.id, [
        { question: newQuestion.trim(), referenceAnswer: newAnswer.trim() },
      ]);
      setShowAddDialog(false);
      setNewQuestion('');
      setNewAnswer('');
      await loadSheet();
    } catch (err) {
      console.error('Failed to add question:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!sheet || !deleteQuestionTarget) return;
    setDeletingQuestion(true);
    try {
      await exerciseApi.deleteSheetQuestion(sheet.id, deleteQuestionTarget.id);
      setDeleteQuestionTarget(null);
      await loadSheet();
    } catch (err) {
      console.error('Failed to delete question:', err);
    } finally {
      setDeletingQuestion(false);
    }
  };

  const handleStartPractice = () => {
    navigate(`/exercise/practice?sheetId=${sheet!.id}`);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !sheet) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error || '题单不存在'}</p>
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
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/exercise-hub')}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary-500" />
              {sheet.name}
            </h1>
            {sheet.tags && (
              <span className="text-xs text-slate-400 dark:text-slate-500">{sheet.tags}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditName(sheet.name);
              setEditTags(sheet.tags || '');
              setShowEditDialog(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300
              hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            编辑
          </button>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              border border-slate-200 dark:border-slate-700 text-red-500 hover:bg-red-50
              dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
          <button
            onClick={handleStartPractice}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium
              bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            开始练习
          </button>
        </div>
      </motion.div>

      {/* Sheet info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 mb-6"
      >
        <div className="flex items-center gap-6 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            共 <strong className="text-slate-800 dark:text-white">{sheet.questions.length}</strong> 题
          </span>
        </div>
      </motion.div>

      {/* Question list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-500" />
            题目列表
          </h2>
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            添加题目
          </button>
        </div>

        {sheet.questions.length === 0 ? (
          <div className="text-center py-10">
            <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">题单中暂无题目，点击上方添加</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sheet.questions.map((q, index) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden"
              >
                <div className="flex items-start gap-3 p-4">
                  <span className="w-6 h-6 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-white mb-2">
                      {q.question}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setExpandedAnswers((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                        }
                        className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600 transition-colors"
                      >
                        {expandedAnswers[q.id] ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            隐藏答案
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            查看答案
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setDeleteQuestionTarget(q)}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedAnswers[q.id] && q.referenceAnswer && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0">
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">参考答案</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                            {q.referenceAnswer}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Edit dialog */}
      <ConfirmDialog
        open={showEditDialog}
        title="编辑题单"
        confirmText="保存"
        confirmVariant="primary"
        loading={editing}
        onConfirm={handleEdit}
        onCancel={() => setShowEditDialog(false)}
        message=""
        customContent={
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                题单名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700
                  bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white
                  placeholder:text-slate-400 focus:outline-none focus:ring-2
                  focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                标签（可选，逗号分隔）
              </label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700
                  bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white
                  placeholder:text-slate-400 focus:outline-none focus:ring-2
                  focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
              />
            </div>
          </div>
        }
      />

      {/* Delete sheet dialog */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        item={sheet}
        itemType="题单"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />

      {/* Add question dialog */}
      <ConfirmDialog
        open={showAddDialog}
        title="添加题目"
        confirmText="添加"
        confirmVariant="primary"
        loading={adding}
        onConfirm={handleAddQuestion}
        onCancel={() => {
          setShowAddDialog(false);
          setNewQuestion('');
          setNewAnswer('');
        }}
        message=""
        customContent={
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                题目 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={3}
                placeholder="输入题目内容..."
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700
                  bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white
                  placeholder:text-slate-400 focus:outline-none focus:ring-2
                  focus:ring-primary-500/50 focus:border-primary-400 transition-shadow resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                参考答案（可选）
              </label>
              <textarea
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                rows={4}
                placeholder="输入参考答案..."
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700
                  bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white
                  placeholder:text-slate-400 focus:outline-none focus:ring-2
                  focus:ring-primary-500/50 focus:border-primary-400 transition-shadow resize-none"
              />
            </div>
          </div>
        }
      />

      {/* Delete question dialog */}
      <DeleteConfirmDialog
        open={!!deleteQuestionTarget}
        item={deleteQuestionTarget}
        itemType="题目"
        loading={deletingQuestion}
        onConfirm={handleDeleteQuestion}
        onCancel={() => setDeleteQuestionTarget(null)}
      />
    </div>
  );
}
