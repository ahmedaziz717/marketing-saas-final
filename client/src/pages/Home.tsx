import { useEffect } from "react";
/** Public pages are server-rendered. An in-app return to / must leave the SPA. */
export default function Home() {
  useEffect(() => {
    window.location.replace("/");
  }, []);
  return (
    <main className="p-8">
      <p>Opening the Frame website...</p>
      <a href="/">Continue to Frame</a>
    </main>
  );
}
