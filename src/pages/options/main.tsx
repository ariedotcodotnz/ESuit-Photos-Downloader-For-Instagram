import { createRoot } from "react-dom/client";
import { PageShell } from "../shared/PageShell";
import { Options } from "./Options";

document.body.style.margin = "0";
createRoot(document.getElementById("app")!).render(<PageShell>{(isDark) => <Options isDark={isDark} />}</PageShell>);
