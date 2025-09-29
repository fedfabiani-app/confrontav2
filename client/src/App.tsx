import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Home as HomeIcon, Info, Settings } from "lucide-react";
import Home from "@/pages/Home";
import SignDetail from "@/pages/SignDetail";
import InfoPage from "@/pages/Info";
import SourcesPage from "@/components/SourceCard";
import NotFound from "@/pages/not-found";
import { useLocation } from "wouter";

function BottomNavigation() {
  const [location, navigate] = useLocation();

  const navItems = [
    { path: '/', icon: HomeIcon, label: 'Home' },
    { path: '/sources', icon: Settings, label: 'Sources' },
    { path: '/info', icon: Info, label: 'Info' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-50">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center py-2 px-4 transition-colors ${
                isActive 
                  ? 'text-orange-500' 
                  : 'text-muted-foreground hover:text-card-foreground'
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
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
        <Route path="/sources" component={SourcesPage} />
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
