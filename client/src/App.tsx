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

  const navItems = [
    { path: '/', icon: HomeIcon, label: 'Home' },
    { path: '/info', icon: Info, label: 'Info' },
  ];

  // Hide navigation on SignDetail pages (paths starting with /sign/)
  if (location.startsWith('/sign/')) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-50">
      <div className="flex items-center justify-around py-1">
        {navItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center py-1 px-4 transition-colors ${
                isActive 
                  ? 'text-orange-500' 
                  : 'text-muted-foreground hover:text-card-foreground'
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
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
