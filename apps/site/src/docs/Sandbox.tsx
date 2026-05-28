/**
 * Sandbox card for a runnable livetrace example.
 *
 * Click-to-launch instead of an inline iframe - the examples use
 * `livetrace: workspace:*`, so StackBlitz / CodeSandbox need the whole repo
 * cloned + `bun install` at the root to resolve deps. An always-on iframe
 * stalls at "Mounting environment"; the explicit launch buttons let users
 * pick their sandbox (or just read the source on GitHub).
 */
import { useState } from "react";

interface SandboxProps {
    readonly path: string;
    readonly title?: string;
    readonly file?: string;
    readonly description?: string;
    readonly height?: number;
}

export function Sandbox({ path, title, file = "src/server.ts", description, height = 560 }: SandboxProps) {
    const [embedded, setEmbedded] = useState(false);

    const repoPath = `examples/${path}`;
    const stackblitzBase = `https://stackblitz.com/github/necmttn/livetrace/tree/main/${repoPath}?view=editor&file=${encodeURIComponent(file)}`;
    const stackblitzEmbed = `${stackblitzBase}&embed=1&theme=dark&hideExplorer=0&ctl=1`;
    const codesandboxUrl = `https://codesandbox.io/p/github/necmttn/livetrace/main/${repoPath}`;
    const githubUrl = `https://github.com/necmttn/livetrace/tree/main/${repoPath}`;

    return (
        <div className="sandbox">
            <div className="sandbox-bar">
                <div className="sandbox-title">
                    <span className="sandbox-dot" />
                    {title ?? `examples/${path}`}
                </div>
                <div className="sandbox-actions">
                    <a href={githubUrl} className="sandbox-link" target="_blank" rel="noreferrer">GitHub</a>
                    <a href={codesandboxUrl} className="sandbox-link" target="_blank" rel="noreferrer">CodeSandbox</a>
                    <a href={stackblitzBase} className="sandbox-link" target="_blank" rel="noreferrer">StackBlitz ↗</a>
                </div>
            </div>
            {embedded ? (
                <iframe
                    src={stackblitzEmbed}
                    title={title ?? `livetrace ${path} example`}
                    loading="lazy"
                    style={{
                        width: "100%",
                        height,
                        border: 0,
                        background: "var(--bg-1)",
                        display: "block",
                    }}
                    allow="clipboard-read; clipboard-write"
                    sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
                />
            ) : (
                <div className="sandbox-launch">
                    {description ? <p className="sandbox-desc">{description}</p> : null}
                    <pre className="sandbox-cmd">
                        <span className="sandbox-cmd-prompt">$</span> git clone https://github.com/necmttn/livetrace{"\n"}
                        <span className="sandbox-cmd-prompt">$</span> bun install{"\n"}
                        <span className="sandbox-cmd-prompt">$</span> bun --filter {path} dev
                    </pre>
                    <div className="sandbox-launch-row">
                        <button type="button" className="sandbox-btn" onClick={() => setEmbedded(true)}>
                            Embed StackBlitz here
                        </button>
                        <a className="sandbox-link sandbox-link-primary" href={stackblitzBase} target="_blank" rel="noreferrer">
                            Open in StackBlitz ↗
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
