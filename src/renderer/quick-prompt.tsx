import ReactDOM from "react-dom/client";
import { QuickPrompt } from "./features/quick-prompt/quick-prompt";
import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  // Force transparency on body and html for the quick prompt
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";

  ReactDOM.createRoot(rootElement).render(<QuickPrompt />);
}
