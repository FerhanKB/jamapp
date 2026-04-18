import { useEffect, useState } from "react";
import { setToastHandler } from "./share";

interface ToastItem {
  id: number;
  msg: string;
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let next = 0;
    setToastHandler((msg) => {
      const id = next++;
      setItems((prev) => [...prev, { id, msg }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, 2500);
    });
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.msg}
        </div>
      ))}
    </div>
  );
}
