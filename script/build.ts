import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir } from "node:fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "@libsql/client",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server (dist/index.cjs)...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("building Vercel serverless handler (api/server.cjs)...");
  await mkdir("api", { recursive: true });

  await esbuild({
    entryPoints: ["server/vercel.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "api/server.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    // Bundle everything — no external deps needed in serverless
    // @libsql/client is included (it supports Vercel edge/node runtimes)
    external: [
      // Node built-ins only
      "node:*",
      "fs",
      "path",
      "http",
      "https",
      "net",
      "os",
      "crypto",
      "stream",
      "util",
      "url",
      "events",
      "buffer",
      "string_decoder",
      "querystring",
      "child_process",
      "cluster",
      "dgram",
      "dns",
      "domain",
      "readline",
      "repl",
      "tls",
      "tty",
      "vm",
      "zlib",
      "assert",
      "punycode",
      "timers",
    ],
    logLevel: "info",
    // Allow @libsql/client WASM to be loaded
    loader: { ".wasm": "file" },
    // Vercel CJS functions need module.exports = handler (not module.exports.default)
    footer: {
      js: "if (typeof module !== 'undefined' && module.exports && module.exports.default) { module.exports = module.exports.default; }",
    },
  });

  console.log("build complete.");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
