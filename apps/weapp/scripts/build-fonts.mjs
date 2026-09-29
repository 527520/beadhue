import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import subsetFont from "subset-font";
// Same source font as Web. Generate an OFL WOFF subset for native/webview loading.
let text = "";
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if (/\.(tsx?|json)$/.test(entry.name))
      text += await readFile(path, "utf8");
  }
}
await collect("src");
text += await readFile("../../src/messages/zh-CN.ts", "utf8");
text +=
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789，。！？：；（）【】「」·—…×%#-+ /";
const bytes = await readFile("../../assets/ui-fonts/NotoSansSC-VF.ttf");
await mkdir("../../public/fonts/weapp", { recursive: true });
for (const weight of [400, 500, 600, 700]) {
  const output = await subsetFont(bytes, [...new Set(text)].join(""), {
    targetFormat: "woff",
    variationAxes: { wght: weight },
  });
  await writeFile(`../../public/fonts/weapp/text-${weight}.woff`, output);
  console.log(`Mini font ${weight}: ${output.byteLength} bytes (remote asset)`);
}
await writeFile(
  "../../public/fonts/weapp/LICENSE.txt",
  await readFile("../../assets/ui-fonts/NotoSans-LICENSE.txt"),
);
