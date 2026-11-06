import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { display } from "./display.js";
import { deepCopy } from "./utils.js";
import { jsx as _jsx } from "react/jsx-runtime";
const useIntersectionObserver = () => {
  const [ref, setRef] = useState();
  const [entry, setEntry] = useState();
  useEffect(() => {
    if (!ref) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setEntry(entry);
    });
    observer.observe(ref);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return [setRef, entry];
};
export const Face = /*#__PURE__*/forwardRef(({
  className,
  face,
  ignoreDisplayErrors,
  lazy,
  overrides,
  style
}, ref) => {
  const [intersectionObserverRef, intersectionObserverEntry] = useIntersectionObserver();
  const faceRef = useRef(null);
  useLayoutEffect(() => {
    if ((intersectionObserverEntry?.isIntersecting || !lazy) && faceRef.current) {
      try {
        if (overrides) {
          // Only apply overrides if face is in viewport
          display(faceRef.current, deepCopy(face), overrides);
        } else {
          display(faceRef.current, face);
        }
      } catch (error) {
        if (!ignoreDisplayErrors) {
          throw error;
        }
      }
    }
  }, [intersectionObserverEntry, face, overrides]);
  return /*#__PURE__*/_jsx("div", {
    className: className,
    ref: node => {
      if (ref) {
        // @ts-expect-error
        ref.current = node;
      }
      // @ts-expect-error
      faceRef.current = node;
      intersectionObserverRef(node);
    },
    style: style
  });
});