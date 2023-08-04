# ts-compiler-api-playground

## esbuildが何かを理解する

### Getting Startedをやってみる

https://esbuild.github.io/getting-started/

```bash
esbuild app.jsx --bundle --outfile=out.js
```

を実行すると、`out.js`はnode_modulesに依存していない、単体で実行可能なファイルになる。

```bash
node out.js
```

なぜNode.jsで実行できるのかが気になった。Node.jsで実行できるコードと、ブラウザで実行できるコードは違うと思うので、そのあたりがどうなっているのかが気になった。

- どの環境向けに出力するかを決められるのか
- 同じような形式で出力されるのか
- Node.js用のライブラリを使っている場合は単純ブラウザで動かなくなるのか
- どちらもサポートしているライブラリの場合はどうなるのか

また、jsxの変換も行ってくれる。これは、esbuildがjsxをデフォルトでサポートしているため。

```bash
esbuild app.jsx --outfile=out.js
```

bundleオプションを省略すると、JSXの変換だけ行われていた。bundle=束ねるなので、複数のモジュールを1つの（複数の場合もある？）ファイルにまとめるという意味。

```js
import * as React from "react";
import * as Server from "react-dom/server";
const Greet = () => /* @__PURE__ */ React.createElement("h1", null, "Hello, world!");
console.log(Server.renderToString(/* @__PURE__ */ React.createElement(Greet, null)));
```

### バンドラの出力コードについて

esbuildのバンドラーは、デフォルトではブラウザ向けのコードを出力する（ブラウザ向けのコードはどのようなものか？）。

ブラウザ向けのコードとは、ES ModulesやCommonJSを使っていないコード。ブラウザではES Modulesを直接使えるけれど、パフォーマンスの問題があったかもしれない。

また、`--minify`を使ってコードを短くしたり、`--target`オプションに対象のブラウザを指定して、新しい文法を古い文法に変換したりもできる。

ブラウザで動かすことを想定されていないパッケージを、esbuildのオプションを使ってブラウザで動かせることがある。例えば、未定義のグローバル変数を`define`や`inject`で置換することができる。

### Node.js向けにバンドルする

Node.jsで動かすためにバンドラは必要ではないが、有用な場合がある。

バンドラを使えば、TypeScriptの型を削除したり、ES ModulesをCommonJSに変換したり、新しいJavaScriptの文法を古い文法に変換したりできる。また、ファイルを小さくしてダウンロードの速度を小さくできる。

Node.js向けにバンドルするには、`--platform=node`オプションを使用する。このオプションを指定した場合は、Node向けのデフォルトの設定が使用される。具体的には次のようなものがある。

- `fs`などの標準パッケージを外部パッケージとしてマークして、バンドルに含めない
- `package.json`のbrowserフィールドを解釈しない（browserフィールドは、ブラウザ向けにモジュールの差し替えを設定するもの）

esbuildのバンドルに対応していないNode.jsの機能はたくさんあるらしい（`__dirname`など）ので、パッケージ（node_modulesに入っているもののことだと思う）をバンドルに含めないオプションがある（`--package=external`）。

`fs`を使うコードを書いてバンドルしてみた。

```js
// app.mjs
import fs from "fs/promises";

async function main() {
  const content = await fs.readFile(".gitignore", { encoding: "utf-8" });
  console.log(content);
}

main();
```

```bash
node app.mjs
```

デフォルトはブラウザ向けのバンドルなので、"fs/promises"をバンドルに含めようとしてエラーになっている。見たことのあるエラー。

```bash
$ esbuild app.mjs --bundle --outfile=out.js
✘ [ERROR] Could not resolve "fs/promises"

    app.mjs:1:15:
      1 │ import fs from "fs/promises";
        ╵                ~~~~~~~~~~~~~

  The package "fs/promises" wasn't found on the file system but is built into node. Are you trying
  to bundle for node? You can use "--platform=node" to do that, which will remove this error.

1 error
```

`--platform=node`をつけて、エラーが解消することを確認する。fsは外部モジュールだと認識されて、そのままになっている。`out.js`はCommonJSで出力されていた。

```bash
$ esbuild app.mjs --bundle --outfile=out.js

  out.js  1.4kb

⚡ Done in 6ms
```

### まとめ

なんとなく理解できてよかった。

esbuildは、ファイルを変換したり（JSX→JavaScript、TypeScript→JavaScript、新しいJavaScript→古いJavaScript、minifyなど）、バンドルしたりするためのツール。


```text
An extremely fast bundler for the web
```

とあるように、ブラウザを対象にバンドルすることがメインの役割だと思われる。バンドルとは、複数のファイルを1つにまとめることをいう。ES Modulesで書かれたコードをまとめたり、node_modulesの中身を出力に含めてくれる。


また、Node.js向けにバンドルすることもできる。Node.jsではバンドルは不要だが、TypeScriptをJavaScriptに変換したり、パッケージを配布する場合にサイズを小さくできるので、使うこともできる。esbuildでNode.js向けにバンドルする場合は`--platform=node`オプションを使う。

`--platform=node`をつけた場合は、`fs`などの標準モジュールを外部パッケージとしてマークして、バンドルに含めない。esbuildのバンドルで対応していないNode.jsの機能がたくさんあるらしいので、npmでインストールしたパッケージをバンドルに含めない方が多いかもしれない。その場合は、`---package=external`オプションを使用する。

## Remixのビルドで発生していたエラーについて

エラーメッセージの内容から、esbuildのエラーだと分かった。ブラウザ向けにバンドルしているのに、Node.jsのAPIを使っている箇所があるのでエラーになっている。

```text
✘ [ERROR] Could not resolve "inspector"

    node_modules/typescript/lib/typescript.js:6924:32:
      6924 │         var inspector = require("inspector");
           ╵                                 ~~~~~~~~~~~

  The package "inspector" wasn't found on the file system but is built into node. Are you trying to bundle for node? You can use "platform: 'node'" to do that, which will remove this error.
```

typescriptのpackage.jsonにはbrowserフィールドがあり、そこでinspectorなどのNode.jsのパッケージは使わないように設定されている。

アプリケーションコードはブラウザ向けにバンドルしているのに、typescriptはブラウザ向けにバンドルされていないのが気になった。これはもしかすると、typescriptをdevDependenciesに入れているのが原因かもしれない（違った）。

あるいは、Remixのビルドでtypescriptを特別扱いしているとか...?
