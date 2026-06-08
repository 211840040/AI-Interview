import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, BookOpen, Plus, Loader2, Trash2, Edit3, ChevronRight,
} from 'lucide-react';
import { EXERCISE_DOMAINS } from '../constants/exerciseDomains';
import { exerciseApi } from '../api/exercise';
import type { ExerciseSheetDTO } from '../types/exercise';
import ConfirmDialog from '../components/ConfirmDialog';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import { formatDateTime } from '../utils/date';
import { TagBadges } from '../utils/tags';

export default function ExerciseHubPage() {
  const navigate = useNavigate();

  const [selectedDomain, setSelectedDomain] = useState<string>('java');

  // Sheet list
  const [sheets, setSheets] = useState<ExerciseSheetDTO[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);

  // Create sheet dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [newSheetTags, setNewSheetTags] = useState('');
  const [creatingSheet, setCreatingSheet] = useState(false);

  // Delete sheet
  const [deleteTarget, setDeleteTarget] = useState<ExerciseSheetDTO | null>(null);
  const [deletingSheet, setDeletingSheet] = useState(false);

  // Edit sheet
  const [editTarget, setEditTarget] = useState<ExerciseSheetDTO | null>(null);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editingSheet, setEditingSheet] = useState(false);

  const loadSheets = useCallback(async () => {
    setLoadingSheets(true);
    try {
      const data = await exerciseApi.listSheets();
      setSheets(data);
    } catch (err) {
      console.error('Failed to load sheets:', err);
    } finally {
      setLoadingSheets(false);
    }
  }, []);

  useEffect(() => {
    loadSheets();
  }, [loadSheets]);

  const handleStartPractice = () => {
    navigate(`/exercise/practice?domain=${selectedDomain}`);
  };

  const handleCreateSheet = async () => {
    if (!newSheetName.trim()) return;
    setCreatingSheet(true);
    try {
      await exerciseApi.createSheet({ name: newSheetName.trim(), tags: newSheetTags.trim() || undefined });
      setShowCreateDialog(false);
      setNewSheetName('');
      setNewSheetTags('');
      await loadSheets();
    } catch (err) {
      console.error('Failed to create sheet:', err);
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleDeleteSheet = async () => {
    if (!deleteTarget) return;
    setDeletingSheet(true);
    try {
      await exerciseApi.deleteSheet(deleteTarget.id);
      setDeleteTarget(null);
      await loadSheets();
    } catch (err) {
      console.error('Failed to delete sheet:', err);
    } finally {
      setDeletingSheet(false);
    }
  };

  const handleEditSheet = async () => {
    if (!editTarget || !editName.trim()) return;
    setEditingSheet(true);
    try {
      await exerciseApi.updateSheet(editTarget.id, { name: editName.trim(), tags: editTags.trim() || undefined });
      setEditTarget(null);
      await loadSheets();
    } catch (err) {
      console.error('Failed to update sheet:', err);
    } finally {
      setEditingSheet(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
          <Sparkles className="w-7 h-7 text-primary-500" />
          专项练习
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          按知识点分类刷题，巩固理论基础，查漏补缺
        </p>
      </motion.div>

      {/* Domain selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 mb-8"
      >
        <div className="space-y-6">
          <div>
            <label className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <BookOpen className="w-4 h-4" />
              选择领域
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {EXERCISE_DOMAINS.map((domain) => {
                const selected = selectedDomain === domain.key;
                return (
                  <button
                    key={domain.key}
                    onClick={() => setSelectedDomain(domain.key)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all duration-200 text-left
                      ${selected
                        ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${
                      selected ? 'bg-primary-100 dark:bg-primary-900/50' : 'bg-slate-100 dark:bg-slate-700'
                    }`}>
                      <span className={selected ? 'text-primary-600 dark:text-primary-400' : ''}>
                        {domain.icon}
                      </span>
                    </div>
                    <span className={`text-xs font-medium ${selected ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300'}`}>
                      {domain.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start button */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
            <motion.button
              onClick={handleStartPractice}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full px-6 py-3 rounded-xl font-semibold text-sm transition-all
                bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                text-white shadow-lg shadow-primary-500/25"
            >
              开始练习
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Sheet list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-500" />
            我的题单
          </h2>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新建题单
          </button>
        </div>

        {loadingSheets ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : sheets.length === 0 ? (
          <div className="text-center py-10">
            <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 dark:text-slate-500 text-sm">暂无题单，创建一个来收藏题目吧</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sheets.map((sheet, index) => (
              <motion.div
                key={sheet.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group cursor-pointer"
                onClick={() => navigate(`/exercise/sheets/${sheet.id}`)}
              >
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-800 dark:text-white truncate">
                      {sheet.name}
                    </span>
                    <TagBadges tags={sheet.tags} />
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {sheet.questionCount} 题
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {formatDateTime(sheet.updatedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTarget(sheet);
                      setEditName(sheet.name);
                      setEditTags(sheet.tags || '');
                    }}
                    className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(sheet);
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Create sheet dialog */}
      <ConfirmDialog
        open={showCreateDialog}
        title="新建题单"
        confirmText="创建"
        confirmVariant="primary"
        loading={creatingSheet}
        onConfirm={handleCreateSheet}
        onCancel={() => {
          setShowCreateDialog(false);
          setNewSheetName('');
          setNewSheetTags('');
        }}
        message="" customContent={
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                题单名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                placeholder="例如：Java 高频题"
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
                value={newSheetTags}
                onChange={(e) => setNewSheetTags(e.target.value)}
                placeholder="例如：Java, 面试, 高频"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700
                  bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white
                  placeholder:text-slate-400 focus:outline-none focus:ring-2
                  focus:ring-primary-500/50 focus:border-primary-400 transition-shadow"
              />
              <TagBadges tags={newSheetTags} className="mt-2" />
            </div>
          </div>
        }
      />

      {/* Edit sheet dialog */}
      <ConfirmDialog
        open={!!editTarget}
        title="编辑题单"
        confirmText="保存"
        confirmVariant="primary"
        loading={editingSheet}
        onConfirm={handleEditSheet}
        onCancel={() => setEditTarget(null)}
        message="" customContent={
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
              <TagBadges tags={editTags} className="mt-2" />
            </div>
          </div>
        }
      />

      {/* Delete sheet dialog */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        item={deleteTarget}
        itemType="题单"
        loading={deletingSheet}
        onConfirm={handleDeleteSheet}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
