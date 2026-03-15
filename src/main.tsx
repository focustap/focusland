// Entry point for the React application.
// It sets up the router and renders the main App component.
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* HashRouter works well with GitHub Pages because it does not require
        special 404 routing rules on the server. */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

