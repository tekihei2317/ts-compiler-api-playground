# ts-compiler-api-browser

```bash
npm run build
open index.html
```

## メモ

`remix build`で、typescriptが`require('inspector')`している箇所でエラーになっていたのが気になったので、原因を調べている。

試してみた感じでは、esbuildでブラウザ向けにバンドルしているので、`inspector`は空のオブジェクトか何かに差し替えられてちゃんと動いている。

```js
// --platform=browser（デフォルト）

var require_inspector = __commonJS({
  "(disabled):inspector"() {
  }
});

const inspector = require_inspector()
```

```js
// --platform=node
const inspector = require("inspector")
```

何かしらの原因で、typescriptがNode.js向けにバンドルされていることが原因みたい。次はRemixをインストールしてCompiler APIを動かしてみようと思う。

## 原因解明？

`--platform=neutral`にすると同じエラーが発生することがわかった。これがどういう設定なのか、neutralのままビルドを通す方法があるのかを調べる。

```text
$ esbuild index.ts --bundle --outfile=dist/bundle.js --platform=neutral --main-fields=browser,module,main
✘ [ERROR] Could not resolve "fs"

    node_modules/typescript/lib/typescript.js:6124:32:
      6124 │           const _fs =   require("fs");
           ╵                                 ~~~~

  The package "fs" wasn't found on the file system but is built into node. Are you trying to bundle
  for node? You can use "--platform=node" to do that, which will remove this error.

✘ [ERROR] Could not resolve "path"

    node_modules/typescript/lib/typescript.js:6125:34:
      6125 │           const _path =   require("path");
           ╵                                   ~~~~~~

  The package "path" wasn't found on the file system but is built into node. Are you trying to
  bundle for node? You can use "--platform=node" to do that, which will remove this error.

✘ [ERROR] Could not resolve "os"

    node_modules/typescript/lib/typescript.js:6126:32:
      6126 │           const _os =   require("os");
           ╵                                 ~~~~

  The package "os" wasn't found on the file system but is built into node. Are you trying to bundle
  for node? You can use "--platform=node" to do that, which will remove this error.

✘ [ERROR] Could not resolve "buffer"

    node_modules/typescript/lib/typescript.js:6135:36:
      6135 │           const Buffer2 =   require("buffer").Buffer;
           ╵                                     ~~~~~~~~

  The package "buffer" wasn't found on the file system but is built into node. Are you trying to
  bundle for node? You can use "--platform=node" to do that, which will remove this error.

✘ [ERROR] Could not resolve "inspector"

    node_modules/typescript/lib/typescript.js:6271:40:
      6271 │             const inspector =   require("inspector");
           ╵                                         ~~~~~~~~~~~

  The package "inspector" wasn't found on the file system but is built into node. Are you trying to
  bundle for node? You can use "--platform=node" to do that, which will remove this error.

5 errors
```
