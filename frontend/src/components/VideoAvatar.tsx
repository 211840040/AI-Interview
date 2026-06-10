import React, { useEffect, useRef, useState } from 'react';

interface VideoAvatarProps {
    defaultSrc: string;
    dynamicSrc?: string | null;
    onDynamicEnd?: () => void;
    className?: string;
    style?: React.CSSProperties;
    dynamicMuted?: boolean;
    defaultMuted?: boolean;
}

const VideoAvatar: React.FC<VideoAvatarProps> = ({
                                                     defaultSrc,
                                                     dynamicSrc,
                                                     onDynamicEnd,
                                                     className = '',
                                                     style,
                                                     dynamicMuted = false,
                                                     defaultMuted = true,
                                                 }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentSrc, setCurrentSrc] = useState<string>(defaultSrc);
    const [isDynamicMode, setIsDynamicMode] = useState<boolean>(false);
    const dynamicSrcRef = useRef<string | null | undefined>(null);
    const [loadError, setLoadError] = useState<boolean>(false);
    const retryCountRef = useRef(0);

    useEffect(() => {
        if (!videoRef.current) return;

        if (dynamicSrc && dynamicSrc !== dynamicSrcRef.current) {
            dynamicSrcRef.current = dynamicSrc;
            setIsDynamicMode(true);
            setCurrentSrc(dynamicSrc);
            setLoadError(false);
            retryCountRef.current = 0;
            videoRef.current.muted = dynamicMuted;
            videoRef.current.load();
            videoRef.current.play().catch(e => console.warn('[VideoAvatar] play dynamic failed', e));
        } else if (!dynamicSrc && isDynamicMode) {
            setIsDynamicMode(false);
            setCurrentSrc(defaultSrc);
            setLoadError(false);
            retryCountRef.current = 0;
            videoRef.current.muted = defaultMuted;
            videoRef.current.load();
            videoRef.current.play().catch(e => console.warn('[VideoAvatar] play default failed', e));
            onDynamicEnd?.();
        }
    }, [dynamicSrc, defaultSrc, isDynamicMode, onDynamicEnd, dynamicMuted, defaultMuted]);

// VideoAvatar.tsx 中关键部分（参考）
    const handleEnded = () => {
        if (isDynamicMode) {
            setIsDynamicMode(false);
            setCurrentSrc(defaultSrc);
            if (videoRef.current) {
                videoRef.current.muted = defaultMuted;
                videoRef.current.load();
                videoRef.current.play().catch(e => console.warn('[VideoAvatar] replay default failed', e));
            }
            onDynamicEnd?.();  // 必须调用
        }
    };

    const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        const target = e.currentTarget;
        console.error('[VideoAvatar] Load error:', target.src, e);
        setLoadError(true);
        // 自动重试最多3次
        if (retryCountRef.current < 3 && target.src === defaultSrc && !isDynamicMode) {
            retryCountRef.current++;
            console.log(`[VideoAvatar] Retry ${retryCountRef.current}/3 for default video`);
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.load();
                    videoRef.current.play().catch(err => console.warn('Retry play failed', err));
                }
            }, 1000);
        }
    };

    if (loadError && !isDynamicMode && retryCountRef.current >= 3) {
        // 降级显示纯色背景或提示
        return (
            <div className={`${className} bg-slate-200 dark:bg-slate-700 flex items-center justify-center`} style={style}>
                <span className="text-slate-500 dark:text-slate-400 text-sm">视频加载失败</span>
            </div>
        );
    }

    return (
        <video
            ref={videoRef}
            src={currentSrc}
            className={className}
            style={style}
            autoPlay
            muted={isDynamicMode ? dynamicMuted : defaultMuted}
            playsInline
            loop={!isDynamicMode}
            onEnded={handleEnded}
            onError={handleError}
        />
    );
};

export default VideoAvatar;