import { clearPreviewCache } from "./preview-cache";
export interface FilePort {
  read(path: string): string;
  bytes(path: string): ArrayBuffer;
  write(path: string, value: string | ArrayBuffer): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
  list(): string[];
}
export function wxFiles(namespace: string): FilePort {
  if (!/^(guest|user-[a-f0-9-]{36})$/.test(namespace))
    throw new Error("非法数据空间");
  const fs = wx.getFileSystemManager();
  const dir = `${wx.env.USER_DATA_PATH}/beadhue-${namespace}`;
  try {
    fs.mkdirSync(dir, true);
  } catch {
    fs.accessSync(dir);
  }
  const path = (name: string) => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error("非法文件名");
    return `${dir}/${name}`;
  };
  return {
    read: (name) => fs.readFileSync(path(name), "utf8") as string,
    bytes: (name) => fs.readFileSync(path(name)) as ArrayBuffer,
    write: (name, value) => {
      const write = () =>
        fs.writeFileSync(
          path(name),
          value,
          typeof value === "string" ? "utf8" : undefined,
        );
      try {
        write();
      } catch {
        clearPreviewCache();
        write();
      }
    },
    rename: (a, b) => fs.renameSync(path(a), path(b)),
    remove: (name) => fs.unlinkSync(path(name)),
    list: () => fs.readdirSync(dir),
  };
}
