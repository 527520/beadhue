import {
  Button as NativeButton,
  Image,
  Input,
  ScrollView,
  Slider,
  Text,
  View,
  type ITouchEvent,
} from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  useState,
  useEffect,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";
export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <Image
      src={`/assets/${name}.svg`}
      style={{ width: size, height: size }}
      mode="aspectFit"
    />
  );
}
export function Button({
  children,
  onClick,
  secondary,
  disabled,
  loading,
}: PropsWithChildren<{
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}>) {
  return (
    <NativeButton
      className={`button ${secondary ? "secondary" : ""}`}
      disabled={disabled || loading}
      loading={loading}
      onClick={onClick}
    >
      {children}
    </NativeButton>
  );
}
export function IconButton({
  name,
  label,
  onClick,
  active,
  disabled,
}: {
  name: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <NativeButton
      ariaLabel={label}
      className={`icon-button ${active ? "selected" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={name} />
    </NativeButton>
  );
}
export function Field({
  label,
  value,
  onChange,
  password,
  placeholder,
  multiline: _multiline,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  password?: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View className="field">
      <Text className="label">{label}</Text>
      <Input
        className="input"
        value={value}
        password={password}
        placeholder={placeholder}
        onInput={(e) => onChange(e.detail.value)}
        maxlength={password ? 128 : 500}
      />
    </View>
  );
}
export function Search({
  value,
  onChange,
  placeholder = "搜索",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <View className="search">
      <Icon name="Search" size={20} />
      <Input
        value={value}
        placeholder={placeholder}
        onInput={(e) => onChange(e.detail.value)}
        maxlength={80}
      />
      {value && <Text onClick={() => onChange("")}>×</Text>}
    </View>
  );
}
export function Chip({
  children,
  active,
  onClick,
}: PropsWithChildren<{ active?: boolean; onClick?: () => void }>) {
  return (
    <View className={`chip ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </View>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <View className="field">
      <View className="between">
        <Text>{label}</Text>
        <Text>{value}</Text>
      </View>
      <Slider
        min={min}
        max={max}
        value={value}
        activeColor="#3160E6"
        blockSize={20}
        onChange={(e) => onChange(e.detail.value)}
      />
    </View>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <View className="empty">
      <View className="empty-beads">
        <View />
        <View />
        <View />
        <View />
      </View>
      <Text className="title2">{title}</Text>
      {detail && <Text className="muted">{detail}</Text>}
      {action}
    </View>
  );
}
export function Notice({ children }: PropsWithChildren) {
  return <View className="notice">{children}</View>;
}
export function Skeleton() {
  return (
    <View className="grid2">
      <View className="skeleton" />
      <View className="skeleton" />
    </View>
  );
}
export function Sheet({
  title,
  onClose,
  children,
}: PropsWithChildren<{ title: string; onClose: () => void }>) {
  const [keyboard, setKeyboard] = useState(0);
  const dragY = useRef<number | null>(null);
  useEffect(() => {
    const change = (e: { height: number }) => setKeyboard(e.height);
    Taro.onKeyboardHeightChange(change);
    return () => Taro.offKeyboardHeightChange(change);
  }, []);
  // Only the handle dismisses by dragging; inner scrolling does not move the sheet.
  return (
    <View className="sheet-mask" catchMove onClick={onClose}>
      <View
        className="sheet"
        style={{ paddingBottom: keyboard || undefined }}
        onClick={(e) => e.stopPropagation()}
        onTouchCancel={() => setKeyboard(0)}
      >
        <View
          className="sheet-grip"
          onTouchStart={(e) => {
            dragY.current = (e as ITouchEvent).touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const y = (e as ITouchEvent).changedTouches[0]?.clientY;
            if (
              dragY.current !== null &&
              y !== undefined &&
              y - dragY.current > 60
            )
              onClose();
            dragY.current = null;
          }}
        />
        <View className="between">
          <Text className="title2">{title}</Text>
          <IconButton name="X" label="关闭" onClick={onClose} />
        </View>
        <ScrollView scrollY className="sheet-scroll">
          {children}
        </ScrollView>
      </View>
    </View>
  );
}
export async function confirm(title: string, content: string) {
  return (await Taro.showModal({ title, content, confirmColor: "#3160E6" }))
    .confirm;
}
export function report(error: unknown) {
  if (
    (error as { errMsg?: string })?.errMsg?.includes("cancel") ||
    (error instanceof Error && error.name === "AbortError")
  )
    return;
  void Taro.showToast({
    title: error instanceof Error ? error.message : "操作失败，请重试",
    icon: "none",
    duration: 3500,
  });
}
export async function perform(job: () => Promise<unknown>) {
  try {
    await job();
  } catch (e) {
    report(e);
  }
}
export function go(url: string) {
  void Taro.navigateTo({ url });
}

/** Native editable modal is supported by WeChat but absent from Taro's older modal type. */
export function promptText(
  title: string,
  content: string,
  placeholderText?: string,
): Promise<{ confirm: boolean; content: string }> {
  return new Promise((resolve, reject) =>
    wx.showModal({
      title,
      content,
      placeholderText,
      editable: true,
      success: (r) => resolve({ confirm: r.confirm, content: r.content ?? "" }),
      fail: reject,
    }),
  );
}
