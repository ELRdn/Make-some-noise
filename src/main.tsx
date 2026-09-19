import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Diagnostics from "./Diagnostics";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {import.meta.env.DEV &&
    new URLSearchParams(location.search).has("diagnostics") ? (
      <Diagnostics />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
