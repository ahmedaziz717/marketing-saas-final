import { createRoot } from "react-dom/client";
import {
  ThemeProvider,
  useTheme,
} from "../../client/src/contexts/ThemeContext";
import { useState } from "react";
function Controls() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <main>
      <h1>Appearance regression fixture</h1>
      <output id="appearance">
        {theme}/{resolvedTheme}
      </output>
      {(["light", "dark", "system"] as const).map(value => (
        <button id={value} key={value} onClick={() => setTheme(value)}>
          {value}
        </button>
      ))}
    </main>
  );
}
function Fixture() {
  const [workspace, setWorkspace] = useState(true);
  return (
    <>
      <button id="navigate" onClick={() => setWorkspace(value => !value)}>
        Navigate public/workspace
      </button>
      <ThemeProvider switchable={workspace}>
        <Controls />
      </ThemeProvider>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
