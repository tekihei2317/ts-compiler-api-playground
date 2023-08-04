import * as ts from "typescript";
import { es5Lib } from "../../../ts-compiler-api-browser/typescript-lib";

const typeChallengeUtils = `export type Expect<T extends true> = T
export type ExpectTrue<T extends true> = T
export type ExpectFalse<T extends false> = T
export type IsTrue<T extends true> = T
export type IsFalse<T extends false> = T

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false
export type NotEqual<X, Y> = true extends Equal<X, Y> ? false : true

// https://stackoverflow.com/questions/49927523/disallow-call-with-any/49928360#49928360
export type IsAny<T> = 0 extends (1 & T) ? true : false
export type NotAny<T> = true extends IsAny<T> ? false : true

export type Debug<T> = { [K in keyof T]: T[K] }
export type MergeInsertions<T> =
  T extends object
    ? { [K in keyof T]: MergeInsertions<T[K]> }
    : T

export type Alike<X, Y> = Equal<MergeInsertions<X>, MergeInsertions<Y>>

export type ExpectExtends<VALUE, EXPECTED> = EXPECTED extends VALUE ? true : false
export type ExpectValidArgs<FUNC extends (...args: any[]) => any, ARGS extends any[]> = ARGS extends Parameters<FUNC>
  ? true
  : false

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never`;

/**
 * 回答とテストケースをコンパイルして、メッセージを返却する
 */
export function compileSolution(solution: string, testCase: string): string[] {
  const sourceFileName = "solution.ts";
  const libFileName = "lib.es5.d.ts";
  const tcUtilsFileName = "type-challenge-utils.ts";

  const options: ts.CompilerOptions = {
    noImplicitAny: true,
    strictNullChecks: true,
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
    noEmit: true,
  };
  const compilerHost: ts.CompilerHost = {
    getSourceFile: (fileName: string) => {
      if (fileName === sourceFileName) {
        return ts.createSourceFile(
          fileName,
          [solution, testCase].join("\n"),
          ts.ScriptTarget.ES5
        );
      }
      if (fileName === libFileName) {
        return ts.createSourceFile(fileName, es5Lib, ts.ScriptTarget.ES5);
      }
      if (fileName === tcUtilsFileName) {
        return ts.createSourceFile(
          fileName,
          typeChallengeUtils,
          ts.ScriptTarget.ES5
        );
      }
      return undefined;
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    writeFile: () => {},
    getCurrentDirectory: () => "",
    getCanonicalFileName: (fileName: string) => fileName,
    useCaseSensitiveFileNames: () => false,
    getNewLine: () => "\n",
    fileExists: (fileName: string) => {
      return fileName === sourceFileName;
    },
    readFile: () => "",
    getDefaultLibFileName: () => libFileName,
    resolveModuleNames: () => {
      return [{ resolvedFileName: tcUtilsFileName }];
    },
  };

  const program = ts.createProgram([sourceFileName], options, compilerHost);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  return diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  );
}
