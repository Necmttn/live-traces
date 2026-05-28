declare module "*.md" {
    import type { ComponentType } from "react";

    const Content: ComponentType;
    export default Content;
}

declare module "*.mdx" {
    import type { ComponentType } from "react";

    const Content: ComponentType;
    export default Content;
}
