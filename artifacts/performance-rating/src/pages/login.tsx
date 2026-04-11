import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Lock, Mail } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const { mutate: loginMutation, isPending } = useLogin();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation(
      { data: { username, password } },
      {
        onSuccess: (data) => {
          login(data.token, data.user);
          toast({ title: "Welcome back", description: `Logged in as ${data.user.displayName}` });
        },
        onError: (err) => {
          toast({
            title: "Login Failed",
            description: err.message || "Invalid credentials",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="Background" 
          className="w-full h-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="z-10 w-full max-w-md"
      >
        <Card className="glass p-8 md:p-10 shadow-2xl shadow-primary/10 rounded-[2rem] border-white/20 dark:border-white/10">
          <div className="flex flex-col items-center mb-10">
            <div className="bg-white p-4 rounded-2xl shadow-sm mb-6">
              <img 
                src="https://www.highspring.com/wp-content/uploads/sites/2/2025/01/HS-black-logo.svg" 
                alt="HighSpring Logo" 
                className="h-10 object-contain" 
              />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Performance Portal</h1>
            <p className="text-muted-foreground mt-2 text-center text-sm">Sign in to manage ratings and approvals.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-11 h-12 bg-background/50 border-border/50 focus:bg-background rounded-xl"
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 h-12 bg-background/50 border-border/50 focus:bg-background rounded-xl"
                  required
                />
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={isPending} 
              className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-primary/80 hover-elevate active-elevate-2 shadow-lg shadow-primary/20"
            >
              {isPending ? "Authenticating..." : "Sign In"}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
