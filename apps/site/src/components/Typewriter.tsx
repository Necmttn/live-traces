/**
 * Teleprompter-style text reveal. Streams the `text` prop in at `cps`
 * characters per second with a blinking cyan caret while typing.
 *
 * When `text` changes, the previous run is dropped and we start fresh from
 * the first char - perfect for "now embedding chunk N" style hot-swaps.
 */
import { useEffect, useState } from "react";

interface Props {
    readonly text: string;
    /** Characters per second. Default ≈ comfortable reading speed. */
    readonly cps?: number;
    /** Optional class on the wrapper span. */
    readonly className?: string;
    /** Show caret while typing. Default true. */
    readonly caret?: boolean;
}

export function Typewriter({ text, cps = 65, className, caret = true }: Props) {
    const [shown, setShown] = useState(0);

    useEffect(() => {
        setShown(0);
        if (!text) return;
        const interval = Math.max(8, 1000 / cps);
        // Use a single interval; each tick advances by ~1 char + jitter so
        // visually it feels like real output, not a metronome.
        const id = window.setInterval(() => {
            setShown((n) => {
                if (n >= text.length) {
                    clearInterval(id);
                    return n;
                }
                // Reveal 1-2 chars per tick - gives a slight live-typing flutter
                return Math.min(n + (Math.random() < 0.3 ? 2 : 1), text.length);
            });
        }, interval);
        return () => clearInterval(id);
    }, [text, cps]);

    const isTyping = shown < text.length;
    return (
        <span className={className}>
            {text.slice(0, shown)}
            {caret && isTyping ? <span className="tw-caret">▋</span> : null}
        </span>
    );
}
