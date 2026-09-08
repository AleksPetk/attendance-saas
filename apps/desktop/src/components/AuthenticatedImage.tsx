import { useEffect, useState } from "react";
import { loadDesktopApiAsset } from "../lib/AppProvider";

export function AuthenticatedImage({ src, alt = "", className }: { src?: string | null; alt?: string; className?: string }) {
  const [resolved, setResolved] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setResolved("");
    if (!src) return () => { active = false; };
    void loadDesktopApiAsset(src).then((url) => {
      objectUrl = url.startsWith("blob:") ? url : "";
      if (active) setResolved(url);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return resolved ? <img alt={alt} className={className} src={resolved} /> : null;
}
