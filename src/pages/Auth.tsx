import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function Auth() {
  const { user, loading, signInWithGoogle } = useAuth();

  // Redirect to home if already authenticated
  if (user && !loading) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="animate-pulse">
          <Shield className="h-8 w-8 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-medium">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto p-3 rounded-full bg-gradient-primary w-fit">
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">
              CodeAlign Access
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Building Code Compliance System
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              This is a restricted access system. Only authorized Gmail accounts can sign in.
            </p>
          </div>
          
          <Button 
            onClick={signInWithGoogle}
            size="lg"
            className="w-full"
          >
            <Mail className="mr-2 h-4 w-4" />
            Sign in with Google
          </Button>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Contact your administrator if you need access.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}