import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";
import { openAtLoginItem } from "./menu";

/**
 * The tray icon on Windows and Linux, where a closed window keeps running
 * there (macOS keeps it in the dock instead). Clicking it opens the window.
 */
export function createTray(options: {
  showWindow: () => void;
  onChange: () => void;
  updateItems: () => MenuItemConstructorOptions[];
  iconPath: string;
}): { rebuild: () => void } {
  const icon = nativeImage.createFromPath(options.iconPath).resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  tray.setToolTip("Frapp");
  const rebuild = (): void => {
    const loginItem = openAtLoginItem(options.onChange);
    const updateItems = options.updateItems();
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Frapp", click: () => options.showWindow() },
        ...(loginItem ? [{ type: "separator" } as const, loginItem] : []),
        ...(updateItems.length > 0 ? [{ type: "separator" } as const, ...updateItems] : []),
        { type: "separator" },
        { role: "quit", label: "Quit Frapp" },
      ]),
    );
  };
  rebuild();
  tray.on("click", () => options.showWindow());
  return { rebuild };
}
