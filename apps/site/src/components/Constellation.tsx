/**
 * Decorative animated constellation. Nodes drift in opacity; a handful of
 * edges are "live" with a flowing dashed stroke (cyan), the rest are static
 * faint dashes. Pure SVG so it scales + masks nicely.
 */
import { useMemo } from "react";

interface Node {
    id: string;
    x: number;
    y: number;
    r: number;
    cls?: string;
}

interface Edge {
    a: number;
    b: number;
    live?: boolean;
}

// Deterministic pseudo-random so SSR + hydration agree
function mulberry32(seed: number): () => number {
    let t = seed;
    return () => {
        t |= 0;
        t = (t + 0x6d2b79f5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export function Constellation({ width = 1440, height = 540 }: { width?: number; height?: number }) {
    const { nodes, edges } = useMemo(() => {
        const rng = mulberry32(0xc0ffee);
        const N = 22;
        const nodes: Node[] = Array.from({ length: N }, (_, i) => ({
            id: `n${i}`,
            x: rng() * width,
            y: rng() * height,
            r: 1 + rng() * 1.6,
            cls: ["", "b", "c", "d", "e"][i % 5]!,
        }));

        // Build edges: connect each node to its 2 nearest neighbors
        const edges: Edge[] = [];
        for (let i = 0; i < N; i++) {
            const distances = nodes
                .map((n, j) => ({ j, d: dist(nodes[i]!, n) }))
                .filter((x) => x.j !== i)
                .sort((a, b) => a.d - b.d);
            for (let k = 0; k < 2; k++) {
                const j = distances[k]!.j;
                if (j > i) edges.push({ a: i, b: j, live: (i + j) % 9 === 0 });
            }
        }
        return { nodes, edges };
    }, [width, height]);

    return (
        <svg className="constellation" width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
            {edges.map((e, i) => {
                const a = nodes[e.a]!;
                const b = nodes[e.b]!;
                return <line key={i} className={`edge${e.live ? " live" : ""}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
            })}
            {nodes.map((n) => (
                <circle key={n.id} className={`node ${n.cls ?? ""}`} cx={n.x} cy={n.y} r={n.r} fill="rgba(0, 212, 255, 0.85)" />
            ))}
        </svg>
    );
}

function dist(a: Node, b: Node): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
