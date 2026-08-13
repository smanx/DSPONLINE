import { useCallback, useEffect, useRef, useState } from "react";
import { trackAnalyticsEvent } from "../game/analytics";

export type MobileWorkspaceId =
  | "technology"
  | "statistics"
  | "recipes"
  | "star-map"
  | "blueprints"
  | "dyson"
  | "campaign"
  | "operations"
  | "galaxy"
  | "construction-center";

export type MobileSheetId = "build" | "inventory" | "inspector" | "planet" | "tools";
export type MobileSheetSnap = "peek" | "half" | "full";

export type MobileRoute =
  | { kind: "factory" }
  | { kind: "hub" }
  | { kind: "workspace"; id: MobileWorkspaceId; subview?: string };

export type MobileOverlay =
  | { kind: "sheet"; id: MobileSheetId; snap: MobileSheetSnap }
  | { kind: "modal"; id: "exit" | "command" | "offline" }
  | null;

const SHEET_SNAP_ORDER: Record<MobileSheetSnap, number> = { peek: 0, half: 1, full: 2 };

function defaultSheetSnap(id: MobileSheetId): MobileSheetSnap {
  return id === "inspector" ? "peek" : "half";
}

const MOBILE_HISTORY_KEY = "__dspMobileNavigationV1";

interface MobileHistoryMarker {
  session: string;
  view: "base" | "guard" | "route";
}

function markerFromState(state: unknown): MobileHistoryMarker | null {
  if (!state || typeof state !== "object") return null;
  const marker = (state as Record<string, unknown>)[MOBILE_HISTORY_KEY];
  if (!marker || typeof marker !== "object") return null;
  const value = marker as Partial<MobileHistoryMarker>;
  return typeof value.session === "string" && (value.view === "base" || value.view === "guard" || value.view === "route")
    ? value as MobileHistoryMarker
    : null;
}

function withMarker(state: unknown, marker: MobileHistoryMarker): Record<string, unknown> {
  return { ...(state && typeof state === "object" ? state as Record<string, unknown> : {}), [MOBILE_HISTORY_KEY]: marker };
}

export function useMobileNavigation({ enabled, onFactoryRequested }: {
  enabled: boolean;
  onFactoryRequested: () => void;
}) {
  const [route, setRoute] = useState<MobileRoute>({ kind: "factory" });
  const [overlay, setOverlay] = useState<MobileOverlay>(null);
  const routeRef = useRef(route);
  const overlayRef = useRef(overlay);
  const enabledRef = useRef(enabled);
  const onFactoryRequestedRef = useRef(onFactoryRequested);
  const workspaceSubviewStackRef = useRef<Array<string | null>>([]);
  const sessionRef = useRef(`mobile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { overlayRef.current = overlay; }, [overlay]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { onFactoryRequestedRef.current = onFactoryRequested; }, [onFactoryRequested]);

  const writeHistory = useCallback((mode: "push" | "replace", view: MobileHistoryMarker["view"]) => {
    if (!enabledRef.current) return;
    const state = withMarker(window.history.state, { session: sessionRef.current, view });
    if (mode === "push") window.history.pushState(state, "", window.location.href);
    else window.history.replaceState(state, "", window.location.href);
  }, []);

  const setFactory = useCallback((replaceHistory = true) => {
    routeRef.current = { kind: "factory" };
    overlayRef.current = null;
    setRoute({ kind: "factory" });
    setOverlay(null);
    workspaceSubviewStackRef.current = [];
    onFactoryRequestedRef.current();
    if (replaceHistory) writeHistory("replace", "guard");
  }, [writeHistory]);

  const navigate = useCallback((nextRoute: MobileRoute, nextOverlay: MobileOverlay = null) => {
    if (!enabledRef.current) return;
    const replace = overlayRef.current !== null || routeRef.current.kind !== "factory";
    routeRef.current = nextRoute;
    overlayRef.current = nextOverlay;
    setRoute(nextRoute);
    setOverlay(nextOverlay);
    writeHistory(replace ? "replace" : "push", "route");
  }, [writeHistory]);

  const openHub = useCallback(() => {
    onFactoryRequestedRef.current();
    workspaceSubviewStackRef.current = [];
    navigate({ kind: "hub" });
  }, [navigate]);

  const openWorkspace = useCallback((id: MobileWorkspaceId) => {
    workspaceSubviewStackRef.current = [];
    navigate({ kind: "workspace", id });
  }, [navigate]);

  const replaceModalWithWorkspace = useCallback((id: MobileWorkspaceId) => {
    if (!enabledRef.current) return;
    if (overlayRef.current?.kind !== "modal") {
      openWorkspace(id);
      return;
    }
    workspaceSubviewStackRef.current = [];
    const next: MobileRoute = { kind: "workspace", id };
    routeRef.current = next;
    overlayRef.current = null;
    setRoute(next);
    setOverlay(null);
    writeHistory("replace", "route");
  }, [openWorkspace, writeHistory]);

  const openSheet = useCallback((id: MobileSheetId, snap = defaultSheetSnap(id)) => {
    onFactoryRequestedRef.current();
    workspaceSubviewStackRef.current = [];
    const initialSnap = id === "inspector" ? "peek" : "half";
    navigate({ kind: "factory" }, { kind: "sheet", id, snap: initialSnap });
    const extraDepth = SHEET_SNAP_ORDER[snap] - SHEET_SNAP_ORDER[initialSnap];
    if (extraDepth <= 0) return;
    const next: MobileOverlay = { kind: "sheet", id, snap };
    overlayRef.current = next;
    setOverlay(next);
    for (let index = 0; index < extraDepth; index += 1) writeHistory("push", "route");
  }, [navigate, writeHistory]);

  const replaceModalWithSheet = useCallback((id: MobileSheetId, snap = defaultSheetSnap(id)) => {
    if (!enabledRef.current) return;
    if (overlayRef.current?.kind !== "modal") {
      openSheet(id, snap);
      return;
    }
    onFactoryRequestedRef.current();
    workspaceSubviewStackRef.current = [];
    const nextOverlay: MobileOverlay = { kind: "sheet", id, snap };
    routeRef.current = { kind: "factory" };
    overlayRef.current = nextOverlay;
    setRoute({ kind: "factory" });
    setOverlay(nextOverlay);
    writeHistory("replace", "route");
  }, [openSheet, writeHistory]);

  const setSheetSnap = useCallback((snap: MobileSheetSnap) => {
    const current = overlayRef.current;
    if (current?.kind !== "sheet" || current.snap === snap) return;
    if (SHEET_SNAP_ORDER[snap] < SHEET_SNAP_ORDER[current.snap]) {
      window.history.back();
      return;
    }
    const next: MobileOverlay = { ...current, snap };
    overlayRef.current = next;
    setOverlay(next);
    writeHistory("push", "route");
    trackAnalyticsEvent("mobile_sheet_snap");
  }, [writeHistory]);

  const openWorkspaceSubview = useCallback((subview: string) => {
    const current = routeRef.current;
    if (current.kind !== "workspace" || current.subview === subview) return;
    workspaceSubviewStackRef.current.push(current.subview ?? null);
    const next: MobileRoute = { ...current, subview };
    routeRef.current = next;
    setRoute(next);
    writeHistory("push", "route");
  }, [writeHistory]);

  const replaceWorkspaceSubview = useCallback((subview: string | undefined) => {
    const current = routeRef.current;
    if (current.kind !== "workspace") return;
    const next: MobileRoute = subview ? { ...current, subview } : { kind: "workspace", id: current.id };
    routeRef.current = next;
    setRoute(next);
    writeHistory("replace", "route");
  }, [writeHistory]);

  const openModal = useCallback((id: "command" | "offline") => {
    onFactoryRequestedRef.current();
    navigate({ kind: "factory" }, { kind: "modal", id });
  }, [navigate]);

  const requestBack = useCallback(() => {
    if (!enabledRef.current) return;
    if (overlayRef.current?.kind === "modal" && overlayRef.current.id === "exit") {
      overlayRef.current = null;
      setOverlay(null);
      return;
    }
    window.history.back();
  }, []);

  const dismissModal = useCallback((id: "command" | "offline") => {
    const current = overlayRef.current;
    if (!enabledRef.current || current?.kind !== "modal" || current.id !== id) return;
    window.history.back();
  }, []);

  const requestExit = useCallback(() => {
    if (!enabledRef.current) return;
    const next: MobileOverlay = { kind: "modal", id: "exit" };
    overlayRef.current = next;
    setOverlay(next);
  }, []);

  const dismissExit = useCallback(() => {
    if (overlayRef.current?.kind !== "modal") return;
    overlayRef.current = null;
    setOverlay(null);
  }, []);

  const syncWorkspace = useCallback((id: MobileWorkspaceId | null) => {
    if (!enabledRef.current) return;
    if (id) {
      if (routeRef.current.kind === "workspace" && routeRef.current.id === id) return;
      workspaceSubviewStackRef.current = [];
      navigate({ kind: "workspace", id });
      return;
    }
    if (routeRef.current.kind === "workspace") setFactory();
  }, [navigate, setFactory]);

  const syncBridgeSheet = useCallback((id: "inventory" | "inspector" | null) => {
    if (!enabledRef.current) return;
    if (id) {
      if (overlayRef.current?.kind === "sheet" && overlayRef.current.id === id) return;
      openSheet(id);
      return;
    }
    if (overlayRef.current?.kind === "sheet" && (overlayRef.current.id === "inventory" || overlayRef.current.id === "inspector")) {
      overlayRef.current = null;
      setOverlay(null);
      writeHistory("replace", "guard");
    }
  }, [openSheet, writeHistory]);

  useEffect(() => {
    if (!enabled) {
      routeRef.current = { kind: "factory" };
      overlayRef.current = null;
      setRoute({ kind: "factory" });
      setOverlay(null);
      return;
    }

    const session = sessionRef.current;
    const originalState = window.history.state;
    window.history.replaceState(withMarker(originalState, { session, view: "base" }), "", window.location.href);
    window.history.pushState(withMarker(window.history.state, { session, view: "guard" }), "", window.location.href);

    const onPopState = () => {
      trackAnalyticsEvent("mobile_back_action");
      const currentOverlay = overlayRef.current;
      if (currentOverlay) {
        if (currentOverlay.kind === "sheet" && currentOverlay.snap === "full") {
          const next: MobileOverlay = { ...currentOverlay, snap: "half" };
          overlayRef.current = next;
          setOverlay(next);
          trackAnalyticsEvent("mobile_sheet_snap");
          return;
        }
        if (currentOverlay.kind === "sheet" && currentOverlay.snap === "half" && currentOverlay.id === "inspector") {
          const next: MobileOverlay = { ...currentOverlay, snap: "peek" };
          overlayRef.current = next;
          setOverlay(next);
          trackAnalyticsEvent("mobile_sheet_snap");
          return;
        }
        overlayRef.current = null;
        setOverlay(null);
        onFactoryRequestedRef.current();
        return;
      }
      if (routeRef.current.kind === "workspace" && routeRef.current.subview) {
        const previousSubview = workspaceSubviewStackRef.current.pop() ?? null;
        const next: MobileRoute = previousSubview
          ? { kind: "workspace", id: routeRef.current.id, subview: previousSubview }
          : { kind: "workspace", id: routeRef.current.id };
        routeRef.current = next;
        setRoute(next);
        return;
      }
      if (routeRef.current.kind !== "factory") {
        routeRef.current = { kind: "factory" };
        setRoute({ kind: "factory" });
        onFactoryRequestedRef.current();
        return;
      }
      const exitOverlay: MobileOverlay = { kind: "modal", id: "exit" };
      overlayRef.current = exitOverlay;
      setOverlay(exitOverlay);
      writeHistory("push", "guard");
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      const marker = markerFromState(window.history.state);
      if (marker?.session === session) window.history.replaceState(originalState, "", window.location.href);
    };
  }, [enabled, writeHistory]);

  return {
    route,
    overlay,
    openHub,
    openWorkspace,
    replaceModalWithWorkspace,
    openWorkspaceSubview,
    replaceWorkspaceSubview,
    openSheet,
    replaceModalWithSheet,
    setSheetSnap,
    openModal,
    goFactory: setFactory,
    requestBack,
    dismissModal,
    requestExit,
    dismissExit,
    syncWorkspace,
    syncBridgeSheet,
  };
}
