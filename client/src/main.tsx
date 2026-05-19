import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Lazy-load the entire Clerk bundle so it doesn't block initial render
const ClerkAuthProvider = lazy(() =>
  import("./components/ClerkAuthProvider").then((m) => ({
    default: m.ClerkAuthProvider,
  }))
);

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;
const root = createRoot(document.getElementById("root")!);

if (PUBLISHABLE_KEY) {
  root.render(
    <Suspense fallback={<App />}>
      <ClerkAuthProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkAuthProvider>
    </Suspense>
  );
} else {
  root.render(<App />);
}
