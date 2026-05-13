import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ClerkAuthProvider } from "./components/ClerkAuthProvider";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const root = createRoot(document.getElementById("root")!);

if (PUBLISHABLE_KEY) {
  root.render(
    <ClerkAuthProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkAuthProvider>
  );
} else {
  root.render(<App />);
}
