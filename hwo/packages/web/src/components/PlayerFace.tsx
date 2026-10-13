/**
 * PlayerFace——球员头像渲染组件
 *
 * 用 facesjs 的 faceToSvgString() 把面部数据渲染为 SVG 字符串，直接注入 DOM。
 * 无面部数据时降级为占位块。
 */

import { useMemo } from "react";
import { faceToSvg, type PlayerFace as PlayerFaceData } from "@hwo/shared";

interface Props {
  face?: PlayerFaceData | null;
  /** 头像边长（px），默认 40 */
  size?: number;
  className?: string;
  title?: string;
}

export function PlayerFace({ face, size = 40, className, title }: Props) {
  const svg = useMemo(() => {
    if (!face) return null;
    try {
      return faceToSvg(face);
    } catch {
      return null;
    }
  }, [face]);

  const cls = `player-face${className ? ` ${className}` : ""}`;
  const style = { width: size, height: size };

  if (!svg) {
    return <span className={`${cls} player-face-empty`} style={style} title={title} aria-hidden />;
  }

  return (
    <span
      className={cls}
      style={style}
      title={title}
      role="img"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
