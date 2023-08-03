import { compileSolution } from "./compiler";

const tests = `import type { Equal, Expect, NotAny } from '@type-challenges/utils'

type cases = [
  Expect<NotAny<HelloWorld>>,
  Expect<Equal<HelloWorld, string>>,
]`;

console.log(compileSolution("type HelloWorld = number", tests));
console.log(compileSolution("type HelloWorld = string", tests));
