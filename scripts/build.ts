import esbuild from "esbuild";

esbuild
  .build({
    entryPoints: ["index.ts"],
    bundle: true,
    outfile: "dist/bundle.js",
    // target: ["chrome58", "firefox57", "safari11", "edge16"],
    // loader: {
    //   ".ts": "ts", // TypeScriptファイルを処理するローダー
    // },
  })
  .catch(() => process.exit(1));
