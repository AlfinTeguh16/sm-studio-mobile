// utils/formdata-debug.ts
export function makeTrackedFormData() {
  const fd = new FormData();
  const items: Array<{ key: string; type: "file" | "text"; name?: string; size?: number; uri?: string; value?: string }> = [];

  const origAppend = fd.append.bind(fd);
  (fd as any).append = (key: string, value: any, fileName?: string) => {
    // RN FormData: file biasanya { uri, name, type }
    if (value && typeof value === "object" && "uri" in value && "name" in value) {
      items.push({ key, type: "file", name: value.name, uri: value.uri, size: (value as any).size }); // size opsional
    } else {
      items.push({ key, type: "text", value: String(value) });
    }
    // teruskan ke append asli
    return origAppend(key, value as any, fileName as any);
  };

  return {
    fd,
    inspect: () => items, // untuk logging
  };
}
