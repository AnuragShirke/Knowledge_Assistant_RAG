import React from 'react';
import { Button } from '@/components/ui/button';
import { Brain, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';

const Header: React.FC = () => {
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-primary rounded-lg shadow-glow">
            <Brain className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Knowledge Assistant
          </h1>
        </div>

        {/* Theme Toggle and Logout Button */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button
            onClick={handleLogout}
            variant="outline"
            className="border-border/50 hover:bg-muted/50 transition-smooth"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;