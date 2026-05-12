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
import NotFound from "@/pages/not-found";

function Footer() {
  return (
    <footer className="w-full py-3 mt-4 text-center">
      <Link href="/info">
        <a 
          className="text-white hover:text-gray-300 transition-colors text-sm"
          data-testid="link-footer-info"
        >
          About • Info
        </a>
      </Link>
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
