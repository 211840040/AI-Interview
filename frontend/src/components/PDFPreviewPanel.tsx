import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, FileText, Loader2, X } from 'lucide-react';

interface PDFPreviewPanelProps {
  resumeId: number;
  filename: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PDFPreviewPanel({ resumeId, filename, isOpen, onClose }: PDFPreviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<number>();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const handleIframeLoad = useCallback(() => {
    clearTimer();
    setLoading(false);
  }, [clearTimer]);

  const proxyUrl = `/api/resumes/${resumeId}/file`;

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setLoadError(false);
    clearTimer();

    timerRef.current = window.setTimeout(() => {
      setLoading(false);
      setLoadError(true);
    }, 15000);

    return clearTimer;
  }, [isOpen, resumeId, clearTimer]);

  const handleDownload = () => {
    window.open(proxyUrl, '_blank');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 250 }}
          className="fixed top-16 left-0 h-[calc(100vh-64px)] w-[720px] max-w-full z-40 bg-white dark:bg-slate-800 shadow-2xl flex flex-col border-r border-slate-200 dark:border-slate-700"

        >
          {/* 面板头部 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-5 h-5 text-primary-500 shrink-0" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                {filename}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 预览区域 */}
          <div className="flex-1 relative min-h-0">
            {/* 加载骨架屏 */}
            {loading && !loadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 z-10">
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
                <p className="text-sm text-slate-400 dark:text-slate-500">加载中...</p>
              </div>
            )}

            {/* 加载错误 */}
            {loadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 z-10 p-6">
                <p className="text-sm text-red-500 mb-4 text-center">
                  无法预览该文件，可能因网络问题或文件类型不受支持
                </p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  下载文件
                </button>
              </div>
            )}

            <iframe
              ref={iframeRef}
              src={proxyUrl}
              className={`w-full h-full border-0 ${loadError ? 'invisible' : ''}`}
              onLoad={handleIframeLoad}
              title="PDF 预览"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
