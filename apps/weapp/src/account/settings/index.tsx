import { Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { Shell } from "../../components/shell";
import {
  Button,
  Chip,
  Field,
  Notice,
  Sheet,
  confirm,
  perform,
  go,
} from "../../components/ui";
import {
  request,
  session,
  setSession,
  type Session,
} from "../../platform/network";
import { migrateGuestDesigns, storageFor } from "../../platform/designs";
import { listBuiltinPalettes } from "@beadhue/core/palettes";
import { AVATAR_PICKER_COLORS } from "@/lib/render/beadTokens";
export default function Settings() {
  const [account, setAccount] = useState(session()),
    [email, setEmail] = useState(session()?.email ?? ""),
    [password, setPassword] = useState(""),
    [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [binding, setBinding] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [panel, setPanel] = useState<"password" | "devices" | null>(null),
    [newPassword, setNewPassword] = useState(""),
    [devices, setDevices] = useState<
      Array<{ current: boolean; createdAt: string; label: string | null }>
    >([]);
  const palettes = listBuiltinPalettes();
  async function accept(value: Session) {
    setSession(value);
    setAccount(value);
    setPassword("");
    if (
      value.emailVerified &&
      (await storageFor("guest").getAll()).length &&
      (await confirm(
        "迁入游客设计",
        "是否将游客设计复制到此账号的私人空间？游客原件仍会保留。",
      ))
    )
      await migrateGuestDesigns();
  }
  async function refresh() {
    const s = session();
    setAccount(s);
    if (!s) return;
    try {
      const me = await request<{
        emailVerified: boolean;
        username: string | null;
      }>("/api/auth/me");
      setUsername(me.username ?? "");
      if (!s.emailVerified)
        await accept({ ...s, emailVerified: me.emailVerified });
      setBinding(
        (await request<{ bound: boolean }>("/api/mini/auth/wechat-binding"))
          .bound,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "无法获取账号信息");
    }
  }
  useDidShow(() => {
    void perform(refresh);
  });
  async function task(job: () => Promise<unknown>) {
    setBusy(true);
    try {
      await job();
    } finally {
      setBusy(false);
    }
  }
  async function emailLogin() {
    if (register) {
      await request("/api/mini/auth/register", {
        method: "POST",
        data: { email, password, username },
        token: null,
      });
      setNotice("验证邮件已发送，请在浏览器完成验证，再回到这里登录。");
      setRegister(false);
      setPassword("");
      return;
    }
    const value = await request<Session>("/api/mini/auth/email-login", {
      method: "POST",
      data: { email, password },
      token: null,
    });
    await accept(value);
    await refresh();
  }
  async function wxLogin() {
    const login = await Taro.login();
    const result = await request<Session & { status: string }>(
      "/api/mini/auth/wechat-login",
      { method: "POST", data: { code: login.code }, token: null },
    );
    if (result.status === "binding-required") {
      setNotice(
        "此微信尚未绑定。请先登录或注册邮箱账号，验证后选择「绑定微信」。",
      );
      return;
    }
    await accept(result);
    await refresh();
  }
  async function logout() {
    await request("/api/auth/logout", { method: "POST" });
    setSession(null);
    setAccount(null);
    setPassword("");
    setNotice("已退出，当前设备的私人设计仍保留在原账号空间。");
  }
  return (
    <Shell title="账号设置" back>
      <View className="content stack">
        {notice && <Notice>{notice}</Notice>}
        {!account ? (
          <>
            <Text className="title1">
              {register ? "创建邮箱账号" : "登录豆色绘"}
            </Text>
            <Text className="muted">
              两端共用账号和私人设计。游客也可以使用完整本地工具。
            </Text>
            <View className="row">
              <Chip active={!register} onClick={() => setRegister(false)}>
                登录
              </Chip>
              <Chip active={register} onClick={() => setRegister(true)}>
                注册
              </Chip>
            </View>
            <Field label="邮箱" value={email} onChange={setEmail} />
            {register && (
              <Field
                label="用户名（可选）"
                value={username}
                onChange={setUsername}
              />
            )}
            <Field
              label="密码"
              value={password}
              onChange={setPassword}
              password
            />
            <Button
              loading={busy}
              onClick={() => void perform(() => task(emailLogin))}
            >
              {register ? "注册并发送验证邮件" : "邮箱登录"}
            </Button>
            <Button
              secondary
              loading={busy}
              onClick={() => void perform(() => task(wxLogin))}
            >
              微信快捷登录
            </Button>
            <Button
              secondary
              onClick={() =>
                void perform(async () => {
                  await request("/api/mini/auth/forgot-password", {
                    method: "POST",
                    data: { email },
                    token: null,
                  });
                  setNotice(
                    "如果邮箱对应有效账号，重置邮件将发送到邮箱。请在浏览器完成重置。",
                  );
                })
              }
            >
              忘记密码
            </Button>
          </>
        ) : (
          <>
            <Text className="title2">{account.email}</Text>
            <Notice>
              {account.emailVerified
                ? "邮箱已验证"
                : "请先在浏览器打开验证邮件，完成后刷新状态。"}
            </Notice>
            <Button secondary onClick={() => void perform(refresh)}>
              刷新验证与绑定状态
            </Button>
            {!account.emailVerified && (
              <Button
                onClick={() =>
                  void perform(async () => {
                    await request("/api/mini/auth/resend-verification", {
                      method: "POST",
                      data: { email: account.email },
                      token: null,
                    });
                    setNotice("验证邮件已发送，请查收。");
                  })
                }
              >
                重发验证邮件
              </Button>
            )}
            {account.emailVerified && (
              <>
                <Field label="用户名" value={username} onChange={setUsername} />
                <Button
                  secondary
                  onClick={() =>
                    void perform(async () => {
                      await request("/api/auth/account", {
                        method: "POST",
                        data: { username },
                      });
                      setNotice("资料已保存");
                    })
                  }
                >
                  保存资料
                </Button>
                <Text className="label">头像底色</Text>
                <View className="color-list">
                  {AVATAR_PICKER_COLORS.map((c) => (
                    <View
                      key={c}
                      className="swatch"
                      style={{ backgroundColor: c }}
                      onClick={() =>
                        void perform(async () => {
                          await request("/api/auth/account", {
                            method: "POST",
                            data: { avatarColor: c },
                          });
                          setNotice("头像底色已保存");
                        })
                      }
                    />
                  ))}
                </View>
                <Picker
                  mode="selector"
                  range={palettes.map((p) => p.label)}
                  onChange={(e) =>
                    void perform(async () => {
                      await request("/api/auth/account", {
                        method: "POST",
                        data: {
                          defaultPalette: palettes[Number(e.detail.value)].id,
                        },
                      });
                      setNotice("默认色板已保存");
                    })
                  }
                >
                  <View className="action-row">设置默认色板 ›</View>
                </Picker>
                <View className="between">
                  <Text>微信绑定</Text>
                  <Text>{binding ? "已绑定" : "未绑定"}</Text>
                </View>
                {!binding ? (
                  <Button
                    loading={busy}
                    onClick={() =>
                      void perform(() =>
                        task(async () => {
                          if (
                            !(await confirm(
                              "绑定微信",
                              "将当前微信绑定到此邮箱账号，以后可微信快捷登录。",
                            ))
                          )
                            return;
                          const login = await Taro.login();
                          await request("/api/mini/auth/wechat-binding", {
                            method: "POST",
                            data: { code: login.code },
                          });
                          setBinding(true);
                          setNotice("微信绑定成功");
                        }),
                      )
                    }
                  >
                    绑定微信
                  </Button>
                ) : (
                  <>
                    <Field
                      label="解绑需验证账号密码"
                      value={password}
                      onChange={setPassword}
                      password
                    />
                    <Button
                      secondary
                      onClick={() =>
                        void perform(async () => {
                          if (
                            !(await confirm(
                              "解绑微信",
                              "解绑后所有小程序设备退出登录，Web 会话保持有效。",
                            ))
                          )
                            return;
                          await request("/api/mini/auth/wechat-binding", {
                            method: "DELETE",
                            data: { password },
                          });
                          setSession(null);
                          setAccount(null);
                          setPassword("");
                          setNotice("已解绑并退出小程序会话");
                        })
                      }
                    >
                      解除微信绑定
                    </Button>
                  </>
                )}
                <Button secondary onClick={() => setPanel("password")}>
                  修改密码
                </Button>
                <Button
                  secondary
                  onClick={() =>
                    void perform(async () => {
                      setDevices(
                        (
                          await request<{ items: typeof devices }>(
                            "/api/me/sessions",
                          )
                        ).items,
                      );
                      setPanel("devices");
                    })
                  }
                >
                  登录设备
                </Button>
                <Button
                  secondary
                  onClick={() =>
                    void perform(async () => {
                      if (
                        await confirm(
                          "复制游客设计",
                          "把游客设计复制到当前账号，已有迁入的版本不会重复复制。",
                        )
                      ) {
                        await migrateGuestDesigns();
                        setNotice("游客设计已复制到此账号");
                      }
                    })
                  }
                >
                  迁入游客设计
                </Button>
                <Field
                  label="注销账号需验证密码"
                  value={password}
                  onChange={setPassword}
                  password
                />
                <Button
                  secondary
                  onClick={() =>
                    void perform(async () => {
                      if (
                        !(await confirm(
                          "永久注销账号",
                          "账号与云端私人数据将删除，此操作不可撤销。请先导出设计备份。",
                        ))
                      )
                        return;
                      await request("/api/auth/account", {
                        method: "DELETE",
                        data: { password },
                      });
                      setSession(null);
                      setAccount(null);
                      setPassword("");
                      setNotice("账号已注销");
                    })
                  }
                >
                  注销账号
                </Button>
              </>
            )}
            <Button secondary onClick={() => void perform(logout)}>
              退出登录
            </Button>
          </>
        )}
        <Button secondary onClick={() => go("/account/help/index")}>
          帮助、隐私与关于
        </Button>
      </View>
      {panel === "password" && (
        <Sheet title="修改密码" onClose={() => setPanel(null)}>
          <Field
            label="当前密码"
            value={password}
            onChange={setPassword}
            password
          />
          <Field
            label="新密码"
            value={newPassword}
            onChange={setNewPassword}
            password
          />
          <Button
            onClick={() =>
              void perform(async () => {
                await request("/api/auth/change-password", {
                  method: "POST",
                  data: { currentPassword: password, newPassword },
                });
                setPanel(null);
                setPassword("");
                setNewPassword("");
                setNotice("密码已修改，其他设备已退出");
              })
            }
          >
            保存新密码
          </Button>
        </Sheet>
      )}
      {panel === "devices" && (
        <Sheet title="登录设备" onClose={() => setPanel(null)}>
          {devices.map((d, i) => (
            <View className="action-row" key={i}>
              <View>
                <Text>
                  {d.label ?? "其他设备"}
                  {d.current ? " · 当前设备" : ""}
                </Text>
                <Text className="caption" style={{ display: "block" }}>
                  {d.createdAt.slice(0, 10)}
                </Text>
              </View>
            </View>
          ))}
          <Button
            secondary
            onClick={() =>
              void perform(async () => {
                await request("/api/me/sessions/revoke-others", {
                  method: "POST",
                });
                setDevices(devices.filter((d) => d.current));
                setNotice("其他设备已退出");
              })
            }
          >
            退出其他设备
          </Button>
        </Sheet>
      )}
    </Shell>
  );
}
