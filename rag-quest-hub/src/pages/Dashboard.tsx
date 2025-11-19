import { Header } from '@/components/Header';
import ChatInterface from '@/components/ChatInterface';
import { DocumentUpload } from '@/components/DocumentUpload';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <main className="flex flex-1 overflow-hidden">
        <div className="flex flex-col w-1/4 border-r p-4">
          <DocumentUpload />
        </div>
        <div className="flex flex-col flex-1 p-4">
          <ChatInterface />
        </div>
      </main>
      <div className="p-4 border-t flex justify-between items-center">
        <ThemeToggle />
        <Button onClick={handleLogout} variant="ghost">
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    </div>
  );
};