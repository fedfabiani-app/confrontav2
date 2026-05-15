import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import SignDetail from "@/pages/SignDetail";
import InfoPage from "@/pages/Info";
import Login from "@/pages/Login";
import Account from "@/pages/Account";
import Pricing from "@/pages/Pricing";
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import Editoriale from '@/pages/Editoriale';
import NotFound from "@/pages/not-found";

function Footer() {
  return (
    <footer className="w-full py-3 mt-4 text-center">
      <div className="flex justify-center items-center gap-4">
        <Link href="/info">
          <a 
            className="text-white hover:text-gray-300 transition-colors text-sm"
            data-testid="link-footer-info"
          >
            About
          </a>
        </Link>
        <span className="text-white text-sm">-</span>
        <Link href="/privacy">
          <a 
            className="text-white hover:text-gray-300 transition-colors text-sm"
            data-testid="link-footer-privacy"
          >
            Privacy
          </a>
        </Link>
        <span className="text-white text-sm">-</span>
        <Link href="/terms">
          <a 
            className="text-white hover:text-gray-300 transition-colors text-sm"
            data-testid="link-footer-terms"
          >
            Termini
          </a>
        </Link>
        <span className="text-white text-sm">-</span>
<Link href="/editoriale">
  <a className="text-white hover:text-gray-300 transition-colors text-sm">
    Editoriale
  </a>
</Link>
<span className="text-white text-sm">-</span>
      </div>
    </footer>
  );
}

function Router() {
  return (
    <>
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
        <Route component={NotFound} />
      </Switch>
    
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
