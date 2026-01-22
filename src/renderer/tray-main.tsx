import ReactDOM from "react-dom/client";
import { TrayPopover } from "./features/tray-popover/tray-popover";
import "./styles/globals.css";

// Tray popover entry point - minimal setup without full app providers
const rootElement = document.getElementById("root");
if (rootElement) {
  // Force transparency on body and html for the popover
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";

  ReactDOM.createRoot(rootElement).render(<TrayPopover />);
}
