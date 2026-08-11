import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const saved = localStorage.getItem("pg-insight-theme") ?? "dark";
const resolved =
  saved === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : saved;
if (resolved === "dark") document.documentElement.classList.add("dark");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
