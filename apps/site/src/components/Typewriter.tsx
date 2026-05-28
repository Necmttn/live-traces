/**
 * Teleprompter-style text reveal.
 *
 * Implementation note: `shown` is *computed* from elapsed real time, not
 * accumulated via setInterval state. With many Typewriters mounted at
 * once (one per log line, one per chunk tile…) the React scheduler can
 * drop interval-driven setState updates, which would leave individual
 * typewriters stuck at a few chars. Deriving from `Date.now()` makes the
 * progress robust to render starvation - each render snaps to the
 * correct character count based on wall-clock time since mount.
 */
import { useEffect, useRef, useState } from "react";

interface Props {
    readonly text: string;
    /** Characters per second. */
    readonly cps?: number;
    readonly className?: string;
    /** Show caret while typing. */
    readonly caret?: boolean;
}

export function Typewriter({ text, cps = 65, className, caret = true }: Props) {
    const startRef = useRef<number>(Date.now());
    const [, setTick] = useState(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        startRef.current = Date.now();
        const totalMs = (text.length / cps) * 1000 + 60;
        let cancelled = false;

        const step = () => {
            if (cancelled) return;
            const elapsed = Date.now() - startRef.current;
            setTick((n) => n + 1);
            if (elapsed < totalMs) {
                rafRef.current = window.requestAnimationFrame(step);
            } else {
                rafRef.current = null;
            }
        };
        rafRef.current = window.requestAnimationFrame(step);

        return () => {
            cancelled = true;
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, [text, cps]);

    const elapsed = Date.now() - startRef.current;
    const shown = Math.min(text.length, Math.floor((elapsed * cps) / 1000));
    const isTyping = shown < text.length;

    return (
        <span className={className}>
            {text.slice(0, shown)}
            {caret && isTyping ? <span className="tw-caret">▋</span> : null}
        </span>
    );
}
