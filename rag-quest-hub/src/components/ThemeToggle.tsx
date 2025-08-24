import React from 'react';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className="border-border/50 hover:bg-muted/50 transition-smooth"
    >
      {theme === 'dark' ? (
        <>
          <Sun className="h-4 w-4 mr-2" />
          Light
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 mr-2" />
          Dark
        </>
      )}
    </Button>
  );
};

export default ThemeToggle;