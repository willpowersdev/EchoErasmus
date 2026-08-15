import { rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });

const result = await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: "dist/index.js",
    format: "cjs",
    sourcemap: true,
    minify: false,
    metafile: true,
    logLevel: "info",
});

// The root package.json is `"type": "module"`, which would otherwise make Node
// (and any local smoke test) read the CJS bundle as ESM. Marking dist explicitly
// keeps the bundle loading the same way locally and on Lambda.
await writeFile("dist/package.json", `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);

const bytes = Object.values(result.metafile.outputs).reduce(
    (total, output) => total + output.bytes,
    0,
);

console.log(`Bundled dist/index.js (${(bytes / 1024).toFixed(0)} kB total)`);
