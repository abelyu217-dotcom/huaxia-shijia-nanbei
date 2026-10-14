/**
 * PlayerFace——球员头像渲染组件
 *
 * 浏览器端通过 facesjs 的 display()（经 shared 暴露为 renderFace）把面部数据
 * 直接渲染进 DOM 容器；faceToSvgString() 仅适用于 Node，不可在浏览器调用。
 * 无面部数据时降级为占位块。
 */

import { useLayoutEffect, useRef } from "react";
import { renderFace, type PlayerFace as PlayerFaceData } from "@hwo/shared";

interface Props {
  face?: PlayerFaceData | null;
  /** 头像边长（px），默认 40 */
  size?: number;
  className?: string;
  title?: string;
}

export function PlayerFace({ face, size = 40, className, title }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !face) return;
    try {
      renderFace(el, face);
      // facesjs 默认按 xMinYMin meet 渲染（画面贴左上角）。方形头像改为铺满容器并居中裁剪。
      el.querySelector("svg")?.setAttribute("preserveAspectRatio", "xMidYMid slice");
    } catch {
      el.innerHTML = "";
    }
  }, [face]);

  const cls = `player-face${className ? ` ${className}` : ""}`;
  const style = { width: size, height: size };

  if (!face) {
    return <span className={`${cls} player-face-empty`} style={style} title={title} aria-hidden />;
  }

  return <span className={cls} style={style} ref={ref} title={title} role="img" aria-label={title} />;
}
