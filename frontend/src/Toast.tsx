import { useEffect, useRef, useState } from "react";

export default function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [phase, setPhase] = useState("enter");
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    const leave = setTimeout(() => setPhase("exit"), 4800);
    const remove = setTimeout(() => done.current(), 5480);
    return () => { clearTimeout(leave); clearTimeout(remove); };
  }, []);
  return <div className={`toast toast--${phase}`} role="status" aria-live="polite" aria-atomic="true"
    onAnimationEnd={e => {
      if (e.target === e.currentTarget && e.animationName === "toast-fly-in") setPhase("rest");
    }}>
    <div className="toast-copy"><strong>Готово</strong><span>{message}</span></div>
  </div>;
}
