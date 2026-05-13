export interface FileIOCallbacks {
  onSaved: (fileName: string, handle: FileSystemFileHandle | null) => void;
  onError: (msg: string) => void;
}

export async function saveAsFile(
  json: string,
  suggestedName: string,
  callbacks: FileIOCallbacks,
): Promise<void> {
  if (typeof (window as any).showSaveFilePicker === "function") {
    try {
      const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      callbacks.onSaved(handle.name, handle);
    } catch (e) {
      if ((e as DOMException).name !== "AbortError") {
        callbacks.onError((e as Error).message);
      }
    }
  } else {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(url);
    callbacks.onSaved(suggestedName, null);
  }
}

export async function saveToHandle(
  json: string,
  handle: FileSystemFileHandle,
  callbacks: Pick<FileIOCallbacks, "onError">,
): Promise<void> {
  try {
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
  } catch (e) {
    callbacks.onError((e as Error).message);
  }
}

export function openFilePicker(
  fileInput: HTMLInputElement,
  onLoad: (json: string, fileName: string) => void,
  onError: (msg: string) => void,
): void {
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onLoad(reader.result as string, file.name);
    };
    reader.onerror = () => onError("Failed to read file.");
    reader.readAsText(file);
    fileInput.value = "";
  });
}
