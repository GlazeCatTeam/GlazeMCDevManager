import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { AboutSection } from "../../plugins/settings/src/sections/AboutSection";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

applyTheme(oreUi);

/** Render the real about page independently of unrelated modules under active development */
function Preview() {
  const [notice, setNotice] = useState("");
  return (
    <SessionProvider value={{ current: null, accounts: [] }}>
      <main style={{ maxWidth: 780, margin: "24px auto", padding: 24 }}>
        <AboutSection autoUpdate={false} onAutoUpdateChange={() => {}} onNotice={setNotice} />
        <p role="status">{notice}</p>
      </main>
    </SessionProvider>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<Preview />);
