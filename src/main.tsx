import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installCatalogSuggest } from "./catalogSuggest";
import "./styles.css";
import "./catalog-suggest.css";
import "./diagnostic-polish.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
void installCatalogSuggest();
