import { useEffect, useState } from "react";
import { loadDesktopApiAsset } from "../lib/AppProvider";

export function useAuthenticatedAsset(src?: string | null, cacheNamespace?: string) {
  const [resolved, setResolved] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setResolved("");
    if (!src) return () => { active = false; };
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setResolved(src);
      return () => { active = false; };
    }
    void loadDesktopApiAsset(src, cacheNamespace).then((url) => {
      objectUrl = url.startsWith("blob:") ? url : "";
      if (active) setResolved(url);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, cacheNamespace]);

  return resolved;
}

export function AuthenticatedImage({
  src,
  alt = "",
  className,
  cacheNamespace,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  cacheNamespace?: string;
}) {
  const resolved = useAuthenticatedAsset(src, cacheNamespace);
  return resolved ? <img alt={alt} className={className} src={resolved} /> : null;
}
