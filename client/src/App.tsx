import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import SignDetail from "@/pages/SignDetail";
import InfoPage from "@/pages/Info";
import NotFound from "@/pages/not-found";
import { useLocation } from "wouter";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/sign/:sign">
        {(params) => <SignDetail sign={params.sign} />}
      </Route>
      <Route path="/info" component={InfoPage} />
      <Route component={NotFound} />
    </Switch>
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
