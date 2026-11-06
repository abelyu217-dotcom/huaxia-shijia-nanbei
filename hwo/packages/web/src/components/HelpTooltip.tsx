/**
 * HelpTooltip —— 帮助提示气泡
 *
 * 参考 BasketPulse 的 "?" 提示设计：每个复杂设置旁加一个问号图标，
 * hover 时显示说明文本，降低新手门槛。
 */

import { useState } from "react";

interface Props {
  text: string;
}

export function HelpTooltip({ text }: Props) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="help-tip"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      <span className="help-tip-icon" aria-label="帮助">?</span>
      {show && <span className="help-tip-bubble">{text}</span>}
    </span>
  );
}
