/**
 * Syntax-highlighted code block. Uses prism-react-renderer with a custom
 * theme tuned to match the site palette.
 */
import { Highlight, themes } from "prism-react-renderer";

const theme = {
    plain: {
        color: "#e6e7e9",
        backgroundColor: "transparent",
    },
    styles: [
        { types: ["comment"], style: { color: "#3d4148", fontStyle: "italic" } },
        { types: ["keyword", "builtin", "operator"], style: { color: "#c792ea" } },
        { types: ["string", "template-string"], style: { color: "#ecc48d" } },
        { types: ["number", "boolean"], style: { color: "#f78c6c" } },
        { types: ["function", "method"], style: { color: "#00d4ff" } },
        { types: ["class-name", "maybe-class-name"], style: { color: "#ffcb6b" } },
        { types: ["punctuation"], style: { color: "#9ca0a6" } },
        { types: ["tag"], style: { color: "#7fdbca" } },
        { types: ["attr-name"], style: { color: "#addb67" } },
        { types: ["property", "property-access"], style: { color: "#e6e7e9" } },
        { types: ["plain"], style: { color: "#e6e7e9" } },
    ],
};

// Ensure prism-react-renderer types compile (themes import is for fallback)
void themes;

export function Code({ code, lang = "tsx" }: { code: string; lang?: "tsx" | "typescript" | "bash" }) {
    return (
        <Highlight code={code.trim()} language={lang} theme={theme as Parameters<typeof Highlight>[0]["theme"]}>
            {({ tokens, getLineProps, getTokenProps }) => (
                <pre>
                    {tokens.map((line, i) => {
                        const lineProps = getLineProps({ line });
                        return (
                            <span key={i} {...lineProps} className={`token-line ${lineProps.className ?? ""}`}>
                                {line.map((token, j) => (
                                    <span key={j} {...getTokenProps({ token })} />
                                ))}
                                {"\n"}
                            </span>
                        );
                    })}
                </pre>
            )}
        </Highlight>
    );
}
