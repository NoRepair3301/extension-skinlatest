import { useState } from "preact/hooks";
import { injectFile, queryActiveTab } from "../api.ts";

export function Popup() {
  const [status, setStatus] = useState("");

  const hello = async () => {
    try {
      const tab = await queryActiveTab();
      if (!tab) throw new Error("no tab");
      await injectFile(tab.id, "applier.js");
      setStatus("Done.");
    } catch {
      setStatus("Skinly can't change this kind of page.");
    }
  };

  return (
    <main>
      <h1>Skinly AI</h1>
      <button type="button" onClick={hello}>Hello</button>
      <p role="status">{status}</p>
      <footer>Skinly AI is not affiliated with any website.</footer>
    </main>
  );
}
