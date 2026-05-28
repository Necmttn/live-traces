import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface NavItem {
    readonly to: string;
    readonly label: string;
}

interface NavGroup {
    readonly heading: string;
    readonly items: ReadonlyArray<NavItem>;
}

const NAV: ReadonlyArray<NavGroup> = [
    {
        heading: "Get started",
        items: [
            { to: "/docs", label: "Overview" },
            { to: "/docs/quickstart", label: "Quickstart" },
            { to: "/docs/concepts", label: "Concepts" },
        ],
    },
    {
        heading: "Reference",
        items: [
            { to: "/docs/transports", label: "Transports" },
            { to: "/docs/frontend", label: "Frontend" },
        ],
    },
    {
        heading: "Integrations",
        items: [
            { to: "/docs/integrations/opentelemetry", label: "OpenTelemetry" },
            { to: "/docs/integrations/durable-streams", label: "Durable Streams" },
        ],
    },
];

export function DocsLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <nav className="nav">
                <div className="container nav-inner">
                    <div className="brand">
                        <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                            <span className="brand-dot-row">
                                <span className="brand-dot" />
                                <span className="brand-dot" />
                                <span className="brand-dot" />
                            </span>
                            livetrace
                        </Link>
                        <span style={{ color: "var(--muted-2)", fontSize: 12 }}>· docs</span>
                    </div>
                    <div className="nav-meta">
                        <Link className="nav-link" to="/">home</Link>
                        <a className="nav-link" href="https://github.com/necmttn/livetrace">github</a>
                        <a className="nav-link" href="https://www.npmjs.com/package/livetrace">npm</a>
                    </div>
                </div>
            </nav>

            <div className="docs-shell">
                <aside className="docs-sidebar">
                    {NAV.map((group) => (
                        <div key={group.heading} className="docs-nav-group">
                            <div className="docs-nav-heading">{group.heading}</div>
                            <ul>
                                {group.items.map((item) => (
                                    <li key={item.to}>
                                        <Link
                                            to={item.to}
                                            className="docs-nav-link"
                                            activeProps={{ className: "docs-nav-link is-active" }}
                                            activeOptions={{ exact: item.to === "/docs" }}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </aside>
                <main className="docs-content">
                    <article className="docs-article">{children}</article>
                </main>
            </div>

            <footer>
                <div className="container footer-inner">
                    <div className="left">
                        <span>Apache-2.0</span>
                        <span>·</span>
                        <span>built by @necmttn</span>
                    </div>
                    <div className="right">
                        <Link to="/">livetrace</Link>
                        <a href="https://github.com/necmttn/livetrace">GitHub</a>
                        <a href="https://www.npmjs.com/package/livetrace">npm</a>
                    </div>
                </div>
            </footer>
        </>
    );
}
