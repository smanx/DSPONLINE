import { Factory, FlaskConical, Hammer, LayoutGrid, PackageOpen } from "lucide-react";
import type { MobileOverlay, MobileRoute } from "../../hooks/useMobileNavigation";

export function MobileBottomNav({ route, overlay, cargoAmount, onFactory, onBuild, onInventory, onTechnology, onHub }: {
  route: MobileRoute;
  overlay: MobileOverlay;
  cargoAmount: number;
  onFactory: () => void;
  onBuild: () => void;
  onInventory: () => void;
  onTechnology: () => void;
  onHub: () => void;
}) {
  const activeSheet = overlay?.kind === "sheet" ? overlay.id : null;
  return (
    <nav className="mobile-next-bottom-nav" aria-label="手机主导航">
      <button className={route.kind === "factory" && !activeSheet ? "active" : ""} type="button" onClick={onFactory} aria-current={route.kind === "factory" && !activeSheet ? "page" : undefined}><Factory size={21} /><span>工厂</span></button>
      <button className={activeSheet === "build" ? "active" : ""} type="button" onClick={onBuild} aria-current={activeSheet === "build" ? "page" : undefined}><Hammer size={21} /><span>建造</span></button>
      <button className={activeSheet === "inventory" ? "active" : ""} type="button" onClick={onInventory} aria-current={activeSheet === "inventory" ? "page" : undefined}><PackageOpen size={21} /><span>物资</span>{cargoAmount > 0 ? <b>{cargoAmount}</b> : null}</button>
      <button className={route.kind === "workspace" && route.id === "technology" ? "active" : ""} type="button" onClick={onTechnology} aria-current={route.kind === "workspace" && route.id === "technology" ? "page" : undefined}><FlaskConical size={21} /><span>科研</span></button>
      <button className={route.kind === "hub" ? "active" : ""} type="button" onClick={onHub} aria-current={route.kind === "hub" ? "page" : undefined}><LayoutGrid size={21} /><span>更多</span></button>
    </nav>
  );
}
