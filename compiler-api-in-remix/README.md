# Welcome to Remix!

```text
$ npx create-remix
? Where would you like to create your app? compiler-api-in-remix
? What type of app do you want to create? Just the basics
? Where do you want to deploy? Choose Remix App Server if you're unsure; it's easy to change deployment targets.
Cloudflare Pages
? TypeScript or JavaScript? TypeScript
? Do you want me to run `npm install`? Yes
```

## オプションについて

```text
// remix.config.jsで"functions/[[path]].js"
    outfile: ctx.config.serverBuildPath,
// ???
    conditions: ctx.config.serverConditions,
// platformはremix.config.jsで"neutral"に設定されていた
    platform: ctx.config.serverPlatform,
// formatはcjsとかesmとか
    format: ctx.config.serverModuleFormat,
// ???
    mainFields: ctx.config.serverMainFields,
```

platform: "neutral"が一番関係していそうな気がする。→platform: "browser"にしたらremix buildが成功したのでそうみたい。

プラグインが色々設定されていたが、どういう内容か、プラグインとはそもそも何なのかはまだ確認できていない。

### 解決

とりあえずこれで動きました。

```js
export default {
  serverNodeBuiltinsPolyfill: {
    modules: {
      inspector: "empty",
      path: "empty",
      os: "empty",
    },
  }
}
```

### platform: "neutral"について

## メモ

RemixでTypeScript Compiler APIを使ったコードを動かしたい。

[esbuildでビルドした時のメモ](../ts-compiler-api-browser/README.md)

次のエラーが出てダメなので、`remix build`で実行している`esbuild`のオプションがどんな感じかを確認する。

```bash
✘ [ERROR] Could not resolve "inspector"

    node_modules/typescript/lib/typescript.js:6271:40:
      6271 │             const inspector =   require("inspector");
           ╵                                         ~~~~~~~~~~~

  The package "inspector" wasn't found on the file system but is built into node. Are you trying to bundle for node? You can use "platform: 'node'" to do that, which will remove this error.
```

このエラー自体は、`require("inspector")`とNode.jsのAPIを使っている`node_modules/typescript/lib/typescript.js`を、ブラウザ向けにバンドルしようとした時に起きるエラー。ただ、typescriptをesbuildでビルドすると、package.jsonのbrowserフィールドに`{ inspector: false }`があるので、このエラーは起きなかった。なので、指定しているオプションの違いに原因がありそうな気がする。

```ts
// @remix-run/dev

"bin": {
  "remix": "dist/cli.js"
},

// packages/remix-dev/cli/index.ts
export { run } from "./run";

// packages/remix-dev/cli/run.ts
import * as commands from "./commands";

    case "build":
      if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
      await commands.build(input[1], process.env.NODE_ENV, flags.sourcemap);
      break;

// packages/remix-dev/cli/commands.ts
import * as compiler from "../compiler";

export async function build(
  remixRoot: string,
  modeArg?: string,
  sourcemap: boolean = false
): Promise<void> {
  // 省略
  await compiler
    .build({ config, options, fileWatchCache, logger })
    .catch((thrown) => {
      compiler.logThrown(thrown);
      process.exit(1);
    });

  logger.info("built" + pc.gray(` (${prettyMs(Date.now() - start)})`));
}

// packages/remix-dev/compiler/index.ts
export { build } from "./build";

// packages/remix-dev/compiler/build.ts
import * as Compiler from "./compiler";
import type { Context } from "./context";

export async function build(ctx: Context): Promise<void> {
  let compiler = await Compiler.create(ctx);
  await compiler.compile();
}
```

ここが実際の処理が行われているところ。それっぽい箇所を探していく。

subcompiler[css, js, server]というのがあって、loaderはサーバーで実行される処理なので、subcompiler.serverがそれっぽい。

```ts
import * as Server from "./server";

// packages/remix-dev/compiler/compiler.ts
export let create = async (ctx: Context): Promise<Compiler> => {
  // these variables _should_ be scoped to a build, not a compiler
  // but esbuild doesn't have an API for passing build-specific arguments for rebuilds
  // so instead use a mutable reference (`refs`) that is compiler-scoped
  // and gets reset on each build
  let refs = {
    lazyCssBundleHref: undefined as unknown as LazyValue<string | undefined>,
    manifestChannel: undefined as unknown as Channel.Type<Manifest>,
  };

  let subcompiler = {
    css: await CSS.createCompiler(ctx),
    js: await JS.createCompiler(ctx, refs),
    server: await Server.createCompiler(ctx, refs),
  };
  let cancel = async () => {
    // resolve channels with error so that downstream tasks don't hang waiting for results from upstream tasks
    refs.lazyCssBundleHref.cancel();
    refs.manifestChannel.err();

    // optimization: cancel tasks
    await Promise.all([
      subcompiler.css.cancel(),
      subcompiler.js.cancel(),
      subcompiler.server.cancel(),
    ]);
  };

  let compile = async (
    options: { onManifest?: (manifest: Manifest) => void } = {}
  ) => {
    let error: unknown | undefined = undefined;
    let errCancel = (thrown: unknown) => {
      if (error === undefined) {
        error = thrown;
      }
      cancel();
      return err(thrown);
    };

    // keep track of manually written artifacts
    let writes: {
      cssBundle?: Promise<void>;
      manifest?: Promise<void>;
      server?: Promise<void>;
    } = {};

    // reset refs for this compilation
    refs.manifestChannel = Channel.create();
    refs.lazyCssBundleHref = createLazyValue({
      async get() {
        let { bundleOutputFile, outputFiles } = await subcompiler.css.compile();

        if (bundleOutputFile) {
          writes.cssBundle = CSS.writeBundle(ctx, outputFiles);
        }

        return (
          bundleOutputFile &&
          ctx.config.publicPath +
            path.relative(
              ctx.config.assetsBuildDirectory,
              path.resolve(bundleOutputFile.path)
            )
        );
      },
      onCancel: ({ reject }) => {
        reject(new Cancel("css-bundle"));
      },
    });

    // kickoff compilations in parallel
    let tasks = {
      js: subcompiler.js.compile().then(ok, errCancel),
      server: subcompiler.server.compile().then(ok, errCancel),
    };

    // js compilation (implicitly writes artifacts/js)
    let js = await tasks.js;
    if (!js.ok) throw error ?? js.error;
    let { metafile, hmr } = js.value;

    // artifacts/manifest
    let manifest = await createManifest({
      config: ctx.config,
      metafile,
      hmr,
      fileWatchCache: ctx.fileWatchCache,
    });
    refs.manifestChannel.ok(manifest);
    options.onManifest?.(manifest);
    writes.manifest = writeManifest(ctx.config, manifest);

    // server compilation
    let server = await tasks.server;
    if (!server.ok) throw error ?? server.error;
    // artifacts/server
    writes.server = Server.write(ctx.config, server.value);

    await Promise.all(Object.values(writes));
    return manifest;
  };
  return {
    compile,
    cancel,
    dispose: async () => {
      await Promise.all(Object.values(subcompiler).map((sub) => sub.dispose()));
    },
  };
};
```

esbuildの設定が書かれているファイルが見つかった。

```ts
// packages/remix-dev/compiler/server/index.ts
export { create as createCompiler } from "./compiler";
export { write } from "./write";
```

順番に見ていく。

```js
// packages/remix-dev/compiler/server/compiler.ts
// ここは['server.ts']になる←remix.configのserverがserverEntryPointに入ってたので
  let entryPoints: string[] | undefined;

  if (ctx.config.serverEntryPoint) {
    entryPoints = [ctx.config.serverEntryPoint];
  } else {
    stdin = {
      contents: ctx.config.serverBuildTargetEntryModule,
      resolveDir: ctx.config.rootDirectory,
      loader: "ts",
    };
  }

// serverRouteModulesPluginあたりがあやしい
  let plugins: esbuild.Plugin[] = [
    deprecatedRemixPackagePlugin(ctx),
    cssBundlePlugin(refs),
    cssModulesPlugin(ctx, { outputCss: false }),
    vanillaExtractPlugin(ctx, { outputCss: false }),
    cssSideEffectImportsPlugin(ctx),
    cssFilePlugin(ctx),
    absoluteCssUrlsPlugin(),
    externalPlugin(/^https?:\/\//, { sideEffects: false }),
    mdxPlugin(ctx),
    emptyModulesPlugin(ctx, /\.client(\.[jt]sx?)?$/),
    serverRouteModulesPlugin(ctx),
    serverEntryModulePlugin(ctx),
    serverAssetsManifestPlugin(refs),
    serverBareModulesPlugin(ctx),
    externalPlugin(/^node:.*/, { sideEffects: false }),
  ];

// esbuild-plugins-node-modules-polyfillというパッケージ
// remix.config.jsのserverNodeBuiltinsPolyfillで設定できる
  if (ctx.config.serverNodeBuiltinsPolyfill) {
    plugins.unshift(
      nodeModulesPolyfillPlugin({
        // Ensure only "modules" option is passed to the plugin
        modules: ctx.config.serverNodeBuiltinsPolyfill.modules,
      })
    );
  }

  return {
    absWorkingDir: ctx.config.rootDirectory,
    stdin,
    entryPoints,
// remix.config.jsで"functions/[[path]].js""
    outfile: ctx.config.serverBuildPath,
// ???
    conditions: ctx.config.serverConditions,
// platformはremix.config.jsで"neutral"に設定されていた
    platform: ctx.config.serverPlatform,
// formatはcjsとかesmとか
    format: ctx.config.serverModuleFormat,
    treeShaking: true,
    // The type of dead code elimination we want to do depends on the
    // minify syntax property: https://github.com/evanw/esbuild/issues/672#issuecomment-1029682369
    // Dev builds are leaving code that should be optimized away in the
    // bundle causing server / testing code to be shipped to the browser.
    // These are properly optimized away in prod builds today, and this
    // PR makes dev mode behave closer to production in terms of dead
    // code elimination / tree shaking is concerned.
    minifySyntax: true,
    minify: ctx.options.mode === "production" && ctx.config.serverMinify,
// ???
    mainFields: ctx.config.serverMainFields,
    target: "node14",
    loader: loaders,
    bundle: true,
    logLevel: "silent",
    // As pointed out by https://github.com/evanw/esbuild/issues/2440, when tsconfig is set to
    // `undefined`, esbuild will keep looking for a tsconfig.json recursively up. This unwanted
    // behavior can only be avoided by creating an empty tsconfig file in the root directory.
    tsconfig: ctx.config.tsconfigPath,
    sourcemap: ctx.options.sourcemap, // use linked (true) to fix up .map file
    // The server build needs to know how to generate asset URLs for imports
    // of CSS and other files.
    assetNames: "_assets/[name]-[hash]",
    publicPath: ctx.config.publicPath,
    define: {
      "process.env.NODE_ENV": JSON.stringify(ctx.options.mode),
      // TODO: remove in v2
      "process.env.REMIX_DEV_SERVER_WS_PORT": JSON.stringify(
        ctx.config.devServerPort
      ),
      "process.env.REMIX_DEV_ORIGIN": JSON.stringify(
        ctx.options.REMIX_DEV_ORIGIN ?? ""
      ),
      // TODO: remove in v2
      "process.env.REMIX_DEV_HTTP_ORIGIN": JSON.stringify(
        ctx.options.REMIX_DEV_ORIGIN ?? ""
      ),
    },
    jsx: "automatic",
    jsxDev: ctx.options.mode !== "production",
    plugins,
  };


```

## メモ

remix.config.jsのserverNodeBuiltinsPolyfillでinspectorのpolyfillしたらなんか変わりそう。

remix.config.jsのオプションは、ほとんどがそのままesbuildのオプションとして渡されている。

`serverDependenciesToBundle`は`packages/remix-dev/compiler/server/plugins/bareImports.ts`で使われている。Cloudflare Pagesでは`serverDependenciesToBundle: 'all'`が設定されていて、これは全てのパッケージをバンドルに含める設定。
