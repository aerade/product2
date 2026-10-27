import { useState } from "react";

export default function Avatar({
  n,
  src,
  className = "avatar",
}: {
  n: number;
  src?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const base = "/art/avatars/avatar-" + String(n).padStart(2, "0");
  return (
    <span className={"user-avatar " + className} aria-hidden="true">
      {src && failed !== src ? (
        <img src={src} alt="" onError={() => setFailed(src)} />
      ) : (
        <>
          <img className="avatar-light" src={base + "-light.webp"} alt="" />
          <img className="avatar-dark" src={base + "-dark.webp"} alt="" />
        </>
      )}
    </span>
  );
}
