/**
 * Sandbox: tabbed source viewer + launch buttons for a livetrace example.
 *
 * Default view shows the actual files inline (shiki-highlighted). "Open in
 * StackBlitz" / CodeSandbox opens the Node-compatible copy at
 * `examples-sandbox/{path}/` - which runs `npm install && npm run dev`
 * inside a WebContainer and serves the live demo.
 *
 * Inline iframe embedding stalls at "Mounting environment" in our docs
 * cross-origin context (WebContainer requires `cross-origin-isolated`,
 * which credentialless iframes don't fully satisfy here). Click-out is
 * the reliable path; it boots in seconds on the StackBlitz tab.
 */
import { useState } from "react";

import { Code } from "../components/Code.js";

import { SANDBOX_SOURCES, type SandboxFile } from "./sandbox-sources.js";

interface SandboxProps {
    readonly path: keyof typeof SANDBOX_SOURCES;
    readonly title?: string;
}

export function Sandbox({ path, title }: SandboxProps) {
    const files: ReadonlyArray<SandboxFile> = SANDBOX_SOURCES[path] ?? [];
    const [activeFile, setActiveFile] = useState(0);

    const repoPath = `examples-sandbox/${path}`;
    const initialFile = files[0]?.path ?? "src/server.ts";
    const stackblitzUrl = `https://stackblitz.com/github/necmttn/livetrace/tree/main/${repoPath}?view=editor&file=${encodeURIComponent(initialFile)}`;
    const codesandboxUrl = `https://codesandbox.io/p/github/necmttn/livetrace/main?file=%2F${repoPath}%2F${initialFile}`;
    const githubUrl = `https://github.com/necmttn/livetrace/tree/main/${repoPath}`;

    const current = files[activeFile];

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
                    <a href={stackblitzUrl} className="sandbox-link sandbox-link-primary" target="_blank" rel="noreferrer">
                        Run in StackBlitz ↗
                    </a>
                </div>
            </div>

            {files.length > 0 ? (
                <>
                    <div className="sandbox-tabs">
                        {files.map((f, i) => (
                            <button
                                key={f.path}
                                type="button"
                                className={`sandbox-tab${i === activeFile ? " is-active" : ""}`}
                                onClick={() => setActiveFile(i)}
                            >
                                {f.path}
                            </button>
                        ))}
                    </div>
                    <div className="sandbox-source">
                        {current ? <Code lang={current.lang} code={current.source} /> : null}
                    </div>
                </>
            ) : (
                <div className="sandbox-empty">
                    No source registered for <code>{path}</code>. Open in StackBlitz to view the full example.
                </div>
            )}
        </div>
    );
}
