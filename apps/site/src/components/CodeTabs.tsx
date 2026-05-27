import { useState } from "react";

interface Tab {
    readonly label: string;
    readonly code: string;
}

export function CodeTabs({ tabs }: { tabs: ReadonlyArray<Tab> }) {
    const [active, setActive] = useState(0);
    const current = tabs[active]!;
    return (
        <div className="code-tabs">
            <div className="code-tabs-bar">
                {tabs.map((t, i) => (
                    <button key={t.label} className={`code-tab ${i === active ? "active" : ""}`} onClick={() => setActive(i)}>
                        {t.label}
                    </button>
                ))}
            </div>
            <pre>
                <code>{current.code}</code>
            </pre>
        </div>
    );
}
