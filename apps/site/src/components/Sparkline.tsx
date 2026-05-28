/**
 * Tiny live sparkline. Caller pushes samples; we keep a sliding window and
 * render an SVG polyline + soft fill.
 */
import { useEffect, useRef, useState } from "react";

export function useEventRate(eventCount: number, windowMs = 200): number {
    const [rate, setRate] = useState(0);
    const lastCountRef = useRef(eventCount);
    const lastTimeRef = useRef(Date.now());

    useEffect(() => {
        const id = setInterval(() => {
            const now = Date.now();
            const dt = now - lastTimeRef.current;
            const delta = eventCount - lastCountRef.current;
            lastCountRef.current = eventCount;
            lastTimeRef.current = now;
            const eps = dt > 0 ? (delta * 1000) / dt : 0;
            // Smooth: blend new sample with previous rate
            setRate((prev) => prev * 0.55 + eps * 0.45);
        }, windowMs);
        return () => clearInterval(id);
    }, [eventCount, windowMs]);

    return rate;
}

export function useSparklineSamples(rate: number, capacity = 60): number[] {
    const [samples, setSamples] = useState<number[]>(() => new Array(capacity).fill(0));
    useEffect(() => {
        const id = setInterval(() => {
            setSamples((prev) => {
                const next = prev.slice(1);
                next.push(rate);
                return next;
            });
        }, 120);
        return () => clearInterval(id);
    }, [rate]);
    return samples;
}

export function Sparkline({ samples, width = 240, height = 24 }: { samples: ReadonlyArray<number>; width?: number; height?: number }) {
    const max = Math.max(...samples, 4);
    const step = width / Math.max(1, samples.length - 1);
    const points = samples.map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * (height - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const linePath = `M ${points.join(" L ")}`;
    const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

    return (
        <svg className="sparkline-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <path className="area" d={areaPath} />
            <path className="line" d={linePath} />
        </svg>
    );
}
