export default function Avatar({
  n,
  className = "avatar",
}: {
  n: number;
  className?: string;
}) {
  const src = "/art/avatars/avatar-" + String(n).padStart(2, "0");
  return (
    <span className={"user-avatar " + className} aria-hidden="true">
      <img className="avatar-light" src={src + "-light.png"} alt="" />
      <img className="avatar-dark" src={src + "-dark.png"} alt="" />
    </span>
  );
}
