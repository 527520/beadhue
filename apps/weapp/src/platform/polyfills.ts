// Mini Program lacks browser TextEncoder/TextDecoder; use byte-only UTF-8 primitives.
import { strToU8, strFromU8 } from "fflate";
if (typeof globalThis.TextEncoder === "undefined") {
  Object.defineProperty(globalThis, "TextEncoder", {
    value: class {
      encode(value = "") {
        return strToU8(value);
      }
    },
  });
}
if (typeof globalThis.TextDecoder === "undefined") {
  Object.defineProperty(globalThis, "TextDecoder", {
    value: class {
      decode(value?: ArrayBuffer | ArrayBufferView) {
        return value
          ? strFromU8(
              value instanceof ArrayBuffer
                ? new Uint8Array(value)
                : new Uint8Array(
                    value.buffer,
                    value.byteOffset,
                    value.byteLength,
                  ),
            )
          : "";
      }
    },
  });
}
