import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Lock, Mail } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
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

  const handleRequestPasscode = async () => {
    if (!forgotEmail.trim()) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }

    try {
      setIsRequestingCode(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch("/api/auth/forgot-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message ?? "Failed to request passcode");
      }

      setForgotStep(2);
      toast({ title: "Passcode sent", description: "Check your email for the verification code." });
    } catch (error) {
      toast({
        title: "Unable to send passcode",
        description: error instanceof Error
          ? error.name === "AbortError"
            ? "Request timed out. Please verify SMTP settings and try again."
            : error.message
          : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRequestingCode(false);
    }
  };

  const handleResetPassword = async () => {
    if (!forgotCode.trim() || !forgotNewPassword) {
      toast({ title: "Code and new password are required", variant: "destructive" });
      return;
    }
    if (forgotNewPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    try {
      setIsResettingPassword(true);
      const response = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: forgotCode.trim(),
          newPassword: forgotNewPassword,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message ?? "Failed to reset password");
      }

      toast({ title: "Password changed", description: "You can now sign in with your new password." });
      setForgotOpen(false);
      setForgotStep(1);
      setForgotCode("");
      setForgotNewPassword("");
      setForgotConfirmPassword("");
    } catch (error) {
      toast({
        title: "Unable to reset password",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
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
                  placeholder="Username or Email"
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
            <Button
              type="button"
              variant="link"
              className="w-full text-sm"
              onClick={() => {
                setForgotOpen(true);
                setForgotStep(1);
                setForgotCode("");
                setForgotNewPassword("");
                setForgotConfirmPassword("");
              }}
            >
              Forgot Password?
            </Button>
          </form>

          <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Forgot Password</DialogTitle>
                <DialogDescription>
                  {forgotStep === 1
                    ? "Step 1: Enter your email to receive a verification passcode."
                    : "Step 2: Enter passcode and set your new password."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={forgotStep === 2}
                  />
                </div>

                {forgotStep === 2 && (
                  <>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Passcode</label>
                      <Input
                        value={forgotCode}
                        onChange={(e) => setForgotCode(e.target.value)}
                        placeholder="6-digit code"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">New Password</label>
                      <Input
                        type="password"
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Confirm Password</label>
                      <Input
                        type="password"
                        value={forgotConfirmPassword}
                        onChange={(e) => setForgotConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                      />
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="gap-2">
                {forgotStep === 1 ? (
                  <Button onClick={handleRequestPasscode} disabled={isRequestingCode}>
                    {isRequestingCode ? "Sending..." : "Send Passcode"}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setForgotStep(1)}
                      disabled={isResettingPassword}
                    >
                      Back
                    </Button>
                    <Button onClick={handleResetPassword} disabled={isResettingPassword}>
                      {isResettingPassword ? "Updating..." : "Change Password"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      </motion.div>
    </div>
  );
}
