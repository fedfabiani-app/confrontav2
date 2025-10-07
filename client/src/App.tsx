import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Home as HomeIcon, Info } from "lucide-react";
import Home from "@/pages/Home";
import SignDetail from "@/pages/SignDetail";
import InfoPage from "@/pages/Info";
import NotFound from "@/pages/not-found";
import { useLocation } from "wouter";

function BottomNavigation() {
  const [location, navigate] = useLocation();

  // Hide navigation on Info page
  if (location === '/info') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-transparent z-50 pointer-events-none">
      <div className="flex items-center justify-center py-4">
        <button
          onClick={() => navigate('/info')}
          className="text-white text-sm hover:text-gray-300 transition-colors pointer-events-auto"
          data-testid="nav-info"
        >
          Info
        </button>
      </div>
    </div>
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
        <Route component={NotFound} />
      </Switch>
      
      <BottomNavigation />
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
