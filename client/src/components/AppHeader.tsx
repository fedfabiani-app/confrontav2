interface AppHeaderProps {
  children: React.ReactNode;
}

export function AppHeader({ children }: AppHeaderProps) {
  return (
    <header 
      className="app-header sticky top-0 z-40 border-b relative overflow-hidden"
    >
      {/* Decorative stars layer */}
      <div className="app-header-stars absolute inset-0 pointer-events-none" />
      
      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {children}
        </div>
      </div>
    </header>
  );
}
