import {
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useAccessibleModalSurface } from "./AccessibleDialog";

export interface WorkspaceFrameProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  open?: boolean;
  ariaLabel: string;
  onRequestClose: () => void;
  children: ReactNode;
}

/**
 * Keeps an established full-screen workspace layout while applying the same
 * modal focus, inert-background and return-focus contract as AccessibleDialog.
 */
export const WorkspaceFrame = forwardRef<HTMLElement, WorkspaceFrameProps>(function WorkspaceFrame({
  open = true,
  ariaLabel,
  onRequestClose,
  children,
  className,
  ...props
}, forwardedRef) {
  const surfaceRef = useRef<HTMLElement>(null);
  const getAdditionalFocusRoots = useCallback((surface: HTMLElement) => {
    const shell = surface.closest<HTMLElement>(".game-shell");
    return [
      ...(shell ? Array.from(shell.querySelectorAll<HTMLElement>(
        ":scope > .game-header, :scope > .mobile-next-topbar, :scope > .mobile-next-bottom-nav",
      )) : []),
      ...Array.from(surface.ownerDocument.querySelectorAll<HTMLElement>("[data-workspace-portal='true']")),
    ];
  }, []);
  useImperativeHandle(forwardedRef, () => surfaceRef.current as HTMLElement, []);
  useAccessibleModalSurface({
    open,
    boundaryRef: surfaceRef,
    surfaceRef,
    onRequestClose: () => onRequestClose(),
    getAdditionalFocusRoots,
  });
  if (!open) return null;
  return <section
    {...props}
    ref={surfaceRef}
    className={className}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel}
    data-workspace-frame="true"
    tabIndex={-1}
  >{children}</section>;
});
