import { Canvas, Switch, Text, View } from "@tarojs/components";
import Taro, { useDidHide, useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { Shell } from "../../components/shell";
import { Button, Notice, perform } from "../../components/ui";
import { PatternPreview } from "../../components/pattern";
import { loadDesign } from "../../platform/designs";
import { canvasNode } from "../../platform/images";
import {
  archive,
  exportPng,
  exportPdf,
  exportProject,
  type ExportFile,
} from "../../platform/exports";
import { cancelTask } from "../../platform/worker";
import type { ProjectFile } from "@beadhue/core/types";
export default function Output() {
  const id = useRouter().params.id ?? "";
  const [project, setProject] = useState<ProjectFile | null>(null),
    [files, setFiles] = useState<ExportFile[]>([]),
    [busy, setBusy] = useState(false),
    [boards, setBoards] = useState(false);
  useEffect(() => {
    void perform(async () => setProject((await loadDesign(id)).project));
  }, [id]);
  useDidHide(cancelTask);
  async function generate(kind: "png" | "pdf" | "json") {
    if (!project) return;
    setBusy(true);
    try {
      setFiles(
        kind === "png"
          ? await exportPng(project, await canvasNode("export-canvas"), boards)
          : [
              await (kind === "pdf"
                ? exportPdf(project)
                : exportProject(project)),
            ],
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell title="导出图纸" back>
      <View className="content stack">
        {project && (
          <>
            <PatternPreview pattern={project.pattern} />
            <Text className="title2">{project.name}</Text>
            <View className="between">
              <Text>PNG 按底板分页</Text>
              <Switch
                checked={boards}
                onChange={(e) => setBoards(e.detail.value)}
                color="#3160E6"
              />
            </View>
            <Notice>
              PNG 包含白底、格线、色号和图例。超过画布上限时自动分页。PDF
              用于打印；项目文件可以在 Web 继续编辑。
            </Notice>
            <View className="row">
              <Button
                loading={busy}
                onClick={() => void perform(() => generate("png"))}
              >
                PNG
              </Button>
              <Button
                loading={busy}
                onClick={() => void perform(() => generate("pdf"))}
              >
                PDF
              </Button>
              <Button
                loading={busy}
                secondary
                onClick={() => void perform(() => generate("json"))}
              >
                项目文件
              </Button>
            </View>
            {files.map((file) => (
              <View key={file.name} className="panel stack">
                <Text>{file.name}</Text>
                <View className="row">
                  {file.type === "png" ? (
                    <>
                      <Button
                        secondary
                        onClick={() =>
                          void Taro.previewImage({
                            urls: files
                              .filter((f) => f.type === "png")
                              .map((f) => f.path),
                            current: file.path,
                          })
                        }
                      >
                        预览
                      </Button>
                      <Button
                        onClick={() =>
                          void perform(async () => {
                            try {
                              await Taro.saveImageToPhotosAlbum({
                                filePath: file.path,
                              });
                            } catch (e) {
                              const settings = await Taro.getSetting();
                              if (
                                settings.authSetting[
                                  "scope.writePhotosAlbum"
                                ] === false
                              ) {
                                await Taro.showModal({
                                  title: "保存相册权限未开启",
                                  content:
                                    "您仍可预览和导出项目文件。如需保存，请在设置中开启相册权限。",
                                  showCancel: false,
                                });
                                await Taro.openSetting();
                              } else throw e;
                            }
                          })
                        }
                      >
                        保存相册
                      </Button>
                    </>
                  ) : (
                    <>
                      {file.type === "pdf" && (
                        <Button
                          secondary
                          onClick={() =>
                            void perform(() =>
                              Taro.openDocument({
                                filePath: file.path,
                                fileType: "pdf",
                                showMenu: true,
                              }),
                            )
                          }
                        >
                          预览
                        </Button>
                      )}
                      <Button
                        onClick={() =>
                          void perform(() =>
                            Taro.shareFileMessage({
                              filePath: file.path,
                              fileName: file.name,
                            }),
                          )
                        }
                      >
                        发送文件
                      </Button>
                    </>
                  )}
                </View>
              </View>
            ))}
            {files.length > 1 && (
              <Button
                secondary
                loading={busy}
                onClick={() =>
                  void perform(async () => {
                    setBusy(true);
                    try {
                      const zip = await archive(
                        files,
                        `豆色绘-${project.name}.zip`,
                      );
                      setFiles((old) => [...old, zip]);
                    } finally {
                      setBusy(false);
                    }
                  })
                }
              >
                打包 ZIP 并发送
              </Button>
            )}
          </>
        )}
        <Canvas id="export-canvas" type="2d" className="hidden-canvas" />
      </View>
    </Shell>
  );
}
