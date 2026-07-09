import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "./styles.css";

const queryClient = new QueryClient();

function Home() {
  return (
    <main className="app-home">
      <img src="/app-icon.png" alt="" className="app-icon" />
      <h1>Tuvu</h1>
      <p>A personal media tracker foundation is ready.</p>
      <Link to="/health">Check API health</Link>
    </main>
  );
}

function Health() {
  return (
    <main className="app-home">
      <h1>Health</h1>
      <p>
        The Worker API is available at <code>/api/health</code>.
      </p>
      <Link to="/">Back home</Link>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/health" element={<Health />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
