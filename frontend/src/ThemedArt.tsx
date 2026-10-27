export default function ThemedArt({ name, alt = "", className = "" }: { name: string; alt?: string; className?: string }) {
  return <span className={"themed-art " + className} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
    <img className="art-light" src={`/art/${name}-light.webp`} alt="" />
    <img className="art-dark" src={`/art/${name}-light.webp`} alt="" />
  </span>;
}
