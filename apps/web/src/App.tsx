import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HostPage } from "./routes/HostPage.js";
import { PlayPage } from "./routes/PlayPage.js";
import { ControllerPage } from "./routes/ControllerPage.js";
import { ControllerDebugPage } from "./routes/ControllerDebugPage.js";
import { ChoreographyToolPage } from "./routes/ChoreographyToolPage.js";
import { NotFoundPage } from "./routes/NotFoundPage.js";

/**
 * Route map from PLAN.md, "Local development and deployment". M0 ships the
 * shell only; each page is filled in by its own milestone.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HostPage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="/controller/debug" element={<ControllerDebugPage />} />
        <Route path="/controller/:roomId" element={<ControllerPage />} />
        <Route path="/tools/choreography" element={<ChoreographyToolPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
