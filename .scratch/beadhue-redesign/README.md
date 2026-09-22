# 豆色绘 / BeadHue 双方案交互原型

## 打开

在本工作树根目录运行：

```bash
python3 -m http.server 4178 --bind 127.0.0.1
```

- 对比入口：<http://127.0.0.1:4178/.scratch/beadhue-redesign/prototype/review.html>
- A 蓝绿作品馆：<http://127.0.0.1:4178/.scratch/beadhue-redesign/prototype/index.html?theme=gallery#discover>
- B 糖果拼豆盒：<http://127.0.0.1:4178/.scratch/beadhue-redesign/prototype/index.html?theme=candy#discover>

使用 HTTP 预览以保证 Canvas 图片读取正常，不建议直接双击 file:// 文件。原型只访问本地静态文件，不连接生产 API 或 COS。

## 试用路径

1. 顶部 A/B 切换只改变视觉，保留当前页面和正在编辑的画布。
2. 发现页搜索/分类/排序 → 作品详情 → 用这张制作。
3. 编辑器默认移动工具；拖动平移，滚轮、缩放按钮或键盘 +/- 缩放，方向键平移。
4. 原图参照：桌面拖动标题、拖动右下角调整尺寸；手机小窗可拖动吸附，展开后上下对照。参照范围与画布一致，不支持反向导航。
5. 画笔/橡皮 → 撤销/重做 → 旋转/镜像；图纸改变而原图保持参照。
6. 手机点「参数」打开面板；底部「原型评审工具」选择失败、限流、容量不足、未登录或缺原图。限流可取消、失败可重试；这些是模拟状态，不是服务端限流实现。
7. 保存 → 公开作品 → 勾选授权 → 提交审核。缺原图/上传未完成会展示继续编辑提示。
8. 创作 → 使用示例或选择本地 PNG/JPG/WebP → 调整裁剪选区 → 生成。文件只在浏览器内解码。
9. 「评审导航」可访问其他页面。编辑器可导出带“原型示例”标注的 PNG，不是正式生产图纸。

## 文件

- `spec.md`：全部已确认业务决策及后续实施关卡。
- `prototype/index.html`、`styles.css`、`app.js`：共用数据与交互，两套视觉主题。
- `prototype/assets/`：本次 SVG 插画及字体 CSS 别名，字体字节引用仓库已有文件。
- `prototype/review.html`：两套方案的截图比较与入口。
- `evidence/`：桌面/手机截图及布局检查结果；`verification.md` 说明验收边界。

以上为原型阶段入口。用户已确认 B，正式实现记录见 [implementation.md](implementation.md)，截图见 `product-evidence/`。线上资源未迁移。
