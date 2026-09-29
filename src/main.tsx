import React from "react";
import ReactDOM from "react-dom/client";
// Fonts are bundled so everything works offline.
import "@fontsource-variable/lora";
import "@fontsource-variable/crimson-pro";
import "@fontsource-variable/montserrat";
import "@fontsource-variable/source-sans-3";
// Malayalam fonts (SIL Open Font License), so Malayalam lyrics render correctly offline.
import "@fontsource-variable/noto-sans-malayalam";
import "@fontsource-variable/noto-serif-malayalam";
import "@fontsource-variable/manrope";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
