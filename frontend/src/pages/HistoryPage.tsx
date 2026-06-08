import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Clock, Download, Eye, FileStack, RefreshCw, Upload, X } from 'lucide-react';
import { historyApi, ResumeListItem } from '../api/history';
import { resumeApi } from '../api/resume';
import { getErrorMessage } from '../api/request';
import FileUploadCard from '../components/FileUploadCard';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import PDFPreviewPanel from '../components/PDFPreviewPanel';
import { formatDateOnly } from '../utils/date';
import { getScoreProgressColor } from '../utils/score';

interface HistoryListProps {
  onSelectResume: (id: number) => void;
}

function isAnalyzing(status?: string): boolean {
  return status === 'PENDING' || status === 'PROCESSING';
}

function AnalyzeStatusIcon({ status }: { status?: string }) {
  if (status === 'FAILED') return <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />;
  if (isAnalyzing(status)) return <RefreshCw className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin" />;
  if (status === 'COMPLETED') return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />;
  return <Clock className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />;
}

function getAnalyzeStatusText(status?: string): string {
  if (status === 'FAILED') return '分析失败';
  if (status === 'PROCESSING') return '分析中';
  if (status === 'PENDING') return '等待分析';
  if (status === 'COMPLETED') return '分析完成';
  return '待分析';
}

function resumesEqual(a: ResumeListItem[], b: ResumeListItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id ||
      a[i].analyzeStatus !== b[i].analyzeStatus ||
      a[i].latestScore !== b[i].latestScore) return false;
  }
  return true;
}

function getScoreGrade(score: number): { label: string; className: string } {
  if (score >= 90) return { label: 'Excellent', className: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
  if (score >= 75) return { label: 'Good', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' };
  if (score >= 60) return { label: 'Fair', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
  return { label: 'Poor', className: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' };
}

function ScoreBadge({ score }: { score: number }) {
  const { label, className } = getScoreGrade(score);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

interface ActionButtonProps {
  title: string;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  disabled?: boolean;
  hoverClass: string;
}

function ActionButton({ title, label, onClick, icon, disabled, hoverClass }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-slate-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${hoverClass}`}
      title={title}
    >
      {icon}
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  );
}

export default function HistoryList({ onSelectResume }: HistoryListProps) {
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; filename: string } | null>(null);
  const [previewResume, setPreviewResume] = useState<{ id: number; filename: string } | null>(null);

  const loadResumes = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    try {
      const data = await historyApi.getResumes();
      setResumes(prev => {
        if (isPolling && resumesEqual(prev, data)) return prev;
        return data;
      });
    } catch (err) {
      console.error('加载历史记录失败', err);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const data = await resumeApi.uploadAndAnalyze(file);
      if (!data.storage || !data.storage.resumeId) {
        throw new Error('上传失败，请重试');
      }
      setShowUploadModal(false);
      await loadResumes();
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  // 轮询：有分析中的简历时启动 3s 轮询
  const hasAnalyzing = resumes.some(r => isAnalyzing(r.analyzeStatus));

  useEffect(() => {
    if (!hasAnalyzing) return;
    const id = window.setInterval(() => loadResumes(true), 3000);
    return () => clearInterval(id);
  }, [hasAnalyzing, loadResumes]);

  const handleDeleteClick = (id: number, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ id, filename });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    const { id } = deleteConfirm;
    setDeletingId(id);
    try {
      await historyApi.deleteResume(id);
      await loadResumes();
      setDeleteConfirm(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败，请稍后重试');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePreview = (id: number, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewResume({ id, filename });
  };

  const handleDownload = async (id: number, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/resumes/${id}/file`);
      if (!response.ok) throw new Error('下载失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('下载简历失败', err);
      alert('下载失败，请稍后重试');
    }
  };

  const filteredResumes = resumes.filter(resume =>
    resume.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <FileStack className="w-7 h-7 text-primary-500" />
            简历管理
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">上传简历即可获得 AI 智能分析，快速定位核心竞争力</p>
        </div>
      </div>


      {/* 搜索栏 + 上传按钮 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors whitespace-nowrap"
        >
          <Upload className="w-4 h-4" />
          上传简历
        </button>
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 flex-1 max-w-md focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100 transition-all">
          <svg className="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="搜索简历..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 bg-transparent"
          />
        </div>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="text-center py-20">
          <motion.div
            className="w-10 h-10 border-3 border-slate-200 dark:text-slate-200 border-t-primary-500 rounded-full mx-auto mb-4"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="text-slate-500 dark:text-slate-400">加载中...</p>
        </div>
      )}

      {/* 空状态 */}
      {!loading && filteredResumes.length === 0 && (
        <motion.div
          className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-6xl mb-6">📄</div>
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">暂无简历记录</h3>
          <p className="text-slate-500 dark:text-slate-400">还没有简历？上传一份简历，开启 AI 智能分析之旅</p>
        </motion.div>
      )}

      {/* 表格 */}
      {!loading && filteredResumes.length > 0 && (
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <table className="w-full table-fixed">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-600">
                <th className="w-[30%] text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">简历名称</th>
                <th className="w-[17.5%] text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">分析状态</th>
                <th className="w-[20%] text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">AI 评分</th>
                <th className="w-[17.5%] text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">上传日期</th>
                <th className="w-[12%] px-4 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  <div className="flex justify-end gap-1 pr-[84px]">操作</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredResumes.map((resume, index) => (
                  <motion.tr
                    key={resume.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => onSelectResume(resume.id)}
                    className="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-10 h-10 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center text-primary-500 dark:text-primary-400">
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                              strokeLinejoin="round" />
                            <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <span className="font-medium text-slate-800 dark:text-white">{resume.filename}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <AnalyzeStatusIcon status={resume.analyzeStatus} />
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {getAnalyzeStatusText(resume.analyzeStatus)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {resume.analyzeStatus === 'COMPLETED' && resume.latestScore !== undefined ? (
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full ${getScoreProgressColor(resume.latestScore)} rounded-full`}
                              initial={{ width: 0 }}
                              animate={{ width: `${resume.latestScore}%` }}
                              transition={{ duration: 0.8, delay: index * 0.05 }}
                            />
                          </div>
                          <span className="font-bold text-slate-800 dark:text-white">{resume.latestScore}</span>
                          <ScoreBadge score={resume.latestScore} />
                        </div>
                      ) : isAnalyzing(resume.analyzeStatus) ? (
                        <span className="text-blue-500 dark:text-blue-400 text-sm">生成中...</span>
                      ) : resume.analyzeStatus === 'FAILED' ? (
                        <span className="text-red-500 dark:text-red-400 text-sm"
                          title={resume.analyzeError}>失败</span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-slate-500 dark:text-slate-400">{formatDateOnly(resume.uploadedAt)}</td>
                    <td className="px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton
                          title="预览 PDF"
                          label="预览"
                          onClick={(e) => handlePreview(resume.id, resume.filename, e)}
                          icon={<Eye className="w-4 h-4" />}
                          hoverClass="hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                        />
                        <ActionButton
                          title="下载简历"
                          label="下载"
                          onClick={(e) => handleDownload(resume.id, resume.filename, e)}
                          icon={<Download className="w-4 h-4" />}
                          hoverClass="hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                        />
                        <ActionButton
                          title="删除简历"
                          label="删除"
                          onClick={(e) => handleDeleteClick(resume.id, resume.filename, e)}
                          disabled={deletingId === resume.id}
                          icon={deletingId === resume.id ? (
                            <motion.div
                              className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            />
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                              <path d="M3 6H5H21M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M10 11V17M14 11V17" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          hoverClass="hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                        />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </motion.div>
      )}

      {/* PDF 预览浮层 */}
      <PDFPreviewPanel
        resumeId={previewResume?.id ?? 0}
        filename={previewResume?.filename ?? ''}
        isOpen={previewResume !== null}
        onClose={() => setPreviewResume(null)}
      />

      {/* 上传简历浮层 */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!uploading) setShowUploadModal(false); }}
          >
            <motion.div
              className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => { if (!uploading) setShowUploadModal(false); }}
                className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="p-6">
                <FileUploadCard
                  title="上传简历"
                  subtitle="支持 PDF、Word 格式，AI 将自动分析简历内容"
                  accept=".pdf,.doc,.docx,.txt"
                  formatHint="支持 PDF, DOCX, TXT"
                  maxSizeHint="最大 10MB"
                  uploading={uploading}
                  uploadButtonText={uploading ? '上传中...' : '开始上传'}
                  selectButtonText="选择简历文件"
                  error={uploadError}
                  onUpload={handleUpload}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={deleteConfirm !== null}
        item={deleteConfirm}
        itemType="简历"
        loading={deletingId !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
        customMessage={
          deleteConfirm ? (
            <>
              <p className="mb-2">确定要删除简历 <strong>"{deleteConfirm.filename}"</strong> 吗？</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">删除后将同时删除：</p>
              <ul className="text-sm text-slate-500 dark:text-red-400 list-disc list-inside mb-2">
                <li>简历评价记录</li>
                <li>所有模拟面试记录</li>
              </ul>
              <p className="text-sm font-semibold text-red-600">此操作不可恢复！</p>
            </>
          ) : undefined
        }
      />
    </motion.div>
  );
}