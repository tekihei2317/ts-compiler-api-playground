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
