import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { historyApi, ResumeDetail } from '../api/history';
import AnalysisPanel from '../components/AnalysisPanel';
import { formatDateOnly } from '../utils/date';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import PDFPreviewPanel from '../components/PDFPreviewPanel';

interface ResumeDetailPageProps {
  resumeId: number;
  onBack: () => void;
}

export default function ResumeDetailPage({ resumeId, onBack }: ResumeDetailPageProps) {
  const [resume, setResume] = useState<ResumeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [pdfPanelOpen, setPdfPanelOpen] = useState(false);

  // 静默加载数据（用于轮询）
  const loadResumeDetailSilent = useCallback(async () => {
    try {
      const data = await historyApi.getResumeDetail(resumeId);
      setResume(data);
    } catch (err) {
      console.error('加载简历详情失败', err);
    }
  }, [resumeId]);

  const loadResumeDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await historyApi.getResumeDetail(resumeId);
      setResume(data);
    } catch (err) {
      console.error('加载简历详情失败', err);
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    loadResumeDetail();
  }, [loadResumeDetail]);

  // 轮询：当分析状态为待处理时，每5秒刷新一次
  // 待处理判断：显式的 PENDING/PROCESSING 状态，或状态未定义且无分析结果
  useEffect(() => {
    const isProcessing = resume && (
      resume.analyzeStatus === 'PENDING' ||
      resume.analyzeStatus === 'PROCESSING' ||
      (resume.analyzeStatus === undefined && (!resume.analyses || resume.analyses.length === 0))
    );

    if (isProcessing && !loading) {
      const timer = setInterval(() => {
        loadResumeDetailSilent();
      }, 5000);

      return () => clearInterval(timer);
    }
  }, [resume, loading, loadResumeDetailSilent]);

  // 重新分析
  const handleReanalyze = async () => {
    try {
      setReanalyzing(true);
      await historyApi.reanalyze(resumeId);
      await loadResumeDetailSilent();
    } catch (err) {
      console.error('重新分析失败', err);
    } finally {
      setReanalyzing(false);
    }
  };

  const handleExportAnalysisPdf = async () => {
    setExporting('analysis');
    try {
      const blob = await historyApi.exportAnalysisPdf(resumeId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `简历分析报告_${resume?.filename || resumeId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('导出失败，请重试');
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <motion.div
          className="w-12 h-12 border-4 border-slate-200 dark:border-slate-600 border-t-primary-500 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  if (!resume) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-4">加载失败，请返回重试</p>
        <button onClick={onBack} className="px-6 py-2 bg-primary-500 text-white rounded-lg">返回列表</button>
      </div>
    );
  }

  const latestAnalysis = resume.analyses?.[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-full flex flex-col"
    >
      {/* 顶部导航栏 */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <motion.button
            onClick={onBack}
            className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300 transition-all shadow-sm"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{resume.filename}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              上传于 {formatDateOnly(resume.uploadedAt)} &nbsp;&nbsp;&nbsp; 左侧可预览简历 PDF
            </p>
          </div>
        </div>

        {/* 操作栏 — 无按钮，仅展示 */}
      </div>

      {/* 内容区域 — flex-1 min-h-0 提供明确高度约束 */}
      <div className="relative flex-1 min-h-0">
        <AnalysisPanel
          analysis={latestAnalysis}
          analyzeStatus={resume.analyzeStatus}
          analyzeError={resume.analyzeError}
          onExport={handleExportAnalysisPdf}
          exporting={exporting === 'analysis'}
          onReanalyze={handleReanalyze}
          reanalyzing={reanalyzing}
        />
      </div>

      {/* PDF 预览面板 */}
      <PDFPreviewPanel
        resumeId={resumeId}
        filename={resume.filename}
        isOpen={pdfPanelOpen}
        onClose={() => setPdfPanelOpen(false)}
      />

      {/* 触发器按钮 — 面板收起时显示，展开时隐藏（用户可通过面板内 X 关闭） */}
      {resume.storageUrl && !pdfPanelOpen && (
        <motion.button
          onClick={() => setPdfPanelOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 group cursor-pointer"
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          title="预览简历"
        >
          <div className="flex items-center gap-1.5 h-12 px-2.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-lg shadow-md transition-all duration-200 group-hover:shadow-lg group-hover:border-primary-300 dark:group-hover:border-primary-600 group-hover:px-3.5">
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary-500 transition-colors shrink-0" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 opacity-0 group-hover:opacity-100 transition-all duration-200 max-w-0 group-hover:max-w-[5rem] overflow-hidden whitespace-nowrap">
              预览简历
            </span>
          </div>
        </motion.button>
      )}
    </motion.div>
  );
}
