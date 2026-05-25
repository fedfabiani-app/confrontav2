import { lazy, Suspense } from "react";
import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";

// All non-home pages are code-split to minimise the initial bundle
const SignDetail = lazy(() => import("@/pages/SignDetail"));
const Account = lazy(() => import("@/pages/Account"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const InfoPage = lazy(() => import("@/pages/Info"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const Contact = lazy(() => import("@/pages/Contact"));
const Editoriale = lazy(() => import("@/pages/Editoriale"));
const SsoCallback = lazy(() => import("@/pages/SsoCallback"));

function Footer() {
  return (
    <footer className="w-full py-3 mt-4 text-center px-2">
      <div className="flex justify-center items-center gap-2">
        <Link href="/info">
          <a
            className="text-white hover:text-gray-300 transition-colors text-xs"
            data-testid="link-footer-info"
          >
            About
          </a>
        </Link>
        <span className="text-white text-sm">-</span>
        <Link href="/privacy">
          <a
            className="text-white hover:text-gray-300 transition-colors text-xs"
            data-testid="link-footer-privacy"
          >
            Privacy
          </a>
        </Link>
        <span className="text-white text-sm">-</span>
        <Link href="/terms">
          <a
            className="text-white hover:text-gray-300 transition-colors text-xs"
            data-testid="link-footer-terms"
          >
            Termini
          </a>
        </Link>
        <span className="text-white text-sm">-</span>
        <Link href="/editoriale">
          <a className="text-white hover:text-gray-300 transition-colors text-xs">
            Editori
          </a>
        </Link>
        <span className="text-white text-sm">-</span>
        <Link href="/contact">
          <a className="text-white hover:text-gray-300 transition-colors text-xs">
            Contatti
          </a>
        </Link>
      </div>
    </footer>
  );
}

function Router() {
  return (
    <>
      <Suspense fallback={<div className="lh-loading" />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/sign/:sign">
            {(params) => <SignDetail sign={params.sign} />}
          </Route>
          <Route path="/info" component={InfoPage} />
          <Route path="/login" component={Login} />
          <Route path="/account" component={Account} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/editoriale" component={Editoriale} />
          <Route path="/contact" component={Contact} />
          <Route path="/sso-callback" component={SsoCallback} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>

      <Footer />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
