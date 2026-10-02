import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { AppProvider } from "./lib/AppProvider";
import { ProductTourHost } from "./productTour/ProductTourHost";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AppProvider>
        <ProductTourHost>
          <App />
        </ProductTourHost>
      </AppProvider>
    </HashRouter>
  </React.StrictMode>,
);
