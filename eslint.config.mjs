import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // src/components/ui/** used to be ignored here as "vendored shadcn output".
    // It is not vendored in any meaningful sense - those files get hand-edited
    // (the sidebar and sheet primitives carry local changes), and an ignore
    // meant the linter never saw a third of the components that ship. It lints
    // clean, so the ignore was hiding nothing but itself.
    //
    // use-mobile.ts stays ignored: it trips react-hooks/set-state-in-effect by
    // seeding its media-query state inside the effect, and it is generated
    // shadcn output that nothing here has had reason to touch.
    "src/hooks/use-mobile.ts",
  ]),
]);

export default eslintConfig;
