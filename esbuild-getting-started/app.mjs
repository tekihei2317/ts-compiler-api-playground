import fs from "fs/promises";

async function main() {
  const content = await fs.readFile(".gitignore", { encoding: "utf-8" });
  console.log(content);
}

main();
