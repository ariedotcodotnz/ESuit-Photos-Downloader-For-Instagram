import { createRoot } from "react-dom/client";
import { PageShell } from "../shared/PageShell";
import { Popup } from "./Popup";
import "./popup.css";

createRoot(document.getElementById("app")!).render(<PageShell>{() => <Popup />}</PageShell>);
