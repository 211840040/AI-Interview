// VideoAvatar.tsx
import React, { useEffect, useRef, useState } from 'react';

interface VideoAvatarProps {
    defaultSrc: string;
    dynamicSrc?: string | null;
    onDynamicEnd?: () => void;
    onPlayStart?: () => void;          // 新增：动态视频开始播放时回调
    className?: string;
    style?: React.CSSProperties;
    dynamicMuted?: boolean;
    defaultMuted?: boolean;
}

const VideoAvatar: React.FC<VideoAvatarProps> = ({
                                                     defaultSrc,
                                                     dynamicSrc,
                                                     onDynamicEnd,
                                                     onPlayStart,
                                                     className = '',
                                                     style,
                                                     dynamicMuted = false,
                                                     defaultMuted = true,
                                                 }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentSrc, setCurrentSrc] = useState<string>(defaultSrc);
    const [isDynamicMode, setIsDynamicMode] = useState<boolean>(false);
    const dynamicSrcRef = useRef<string | null | undefined>(null);
    const playStartTriggeredRef = useRef(false);   // 避免重复触发
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
            playStartTriggeredRef.current = false;   // 重置触发标志
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

    const handleEnded = () => {
        if (isDynamicMode) {
            setIsDynamicMode(false);
            setCurrentSrc(defaultSrc);
            if (videoRef.current) {
                videoRef.current.muted = defaultMuted;
                videoRef.current.load();
                videoRef.current.play().catch(e => console.warn('[VideoAvatar] replay default failed', e));
            }
            onDynamicEnd?.();
        }
    };

    const handlePlay = () => {
        if (isDynamicMode && !playStartTriggeredRef.current) {
            playStartTriggeredRef.current = true;
            onPlayStart?.();
        }
    };

    const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        const target = e.currentTarget;
        console.error('[VideoAvatar] Load error:', target.src, e);
        setLoadError(true);
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
            onPlay={handlePlay}
        />
    );
};

export default VideoAvatar;