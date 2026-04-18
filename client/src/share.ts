import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { buildShareUrl, type DeepLink } from "./deeplinks";

type ToastFn = (msg: string) => void;
let toast: ToastFn = (msg) => console.log(msg);

export function setToastHandler(fn: ToastFn) {
  toast = fn;
}

export async function copyShareLink(link: DeepLink): Promise<string> {
  const url = buildShareUrl(link);
  try {
    await writeText(url);
    toast(`Copied ${url}`);
  } catch {
    try {
      await navigator.clipboard.writeText(url);
      toast(`Copied ${url}`);
    } catch {
      toast(`Share link: ${url}`);
    }
  }
  return url;
}
