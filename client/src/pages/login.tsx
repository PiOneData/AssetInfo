import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Server } from "lucide-react";
import { loginSchema, registerSchema } from "@shared/schema";
import type { LoginRequest, RegisterRequest } from "@shared/schema";

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const { login, register: registerUser, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const loginForm = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
  });

  const registerForm = useForm<RegisterRequest>({
    resolver: zodResolver(registerSchema),
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const handleLogin = async (data: LoginRequest) => {
    try {
      await login(data);
      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });
    } catch (error: any) {
      localStorage.removeItem("token");
      const apiMessage = error?.data?.message || error?.message;
      const description =
        apiMessage?.includes("deactivated")
          ? apiMessage
          : "Invalid email or password. Please try again.";
      toast({
        title: "Login failed",
        description,
        variant: "destructive",
      });
    }
  };

  const handleRegister = async (data: RegisterRequest) => {
    try {
      const response = await registerUser(data);
      const roleAssignment = (response as any)?.roleAssignment;
      
      let description = "Your account has been created successfully.";
      
      if (roleAssignment) {
        if (roleAssignment.isFirstUser) {
          description = "Welcome! As the first user, you've been made an administrator.";
        } else if (roleAssignment.wasDowngraded) {
          description = `Account created! For security, you've been assigned the Employee role. An admin can upgrade your role if needed.`;
        } else {
          description = `Account created! You've joined as a ${roleAssignment.assigned}.`;
        }
      }
      
      toast({
        title: "Account created!",
        description,
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      
      // Handle restricted signup error specifically
      if (error?.status === 403 && error?.data?.code === "SIGNUP_RESTRICTED") {
        const details = error.data.details;
        toast({
          title: "Signup Restricted",
          description: details.message || "An administrator already exists for this organization. Please contact your admin to receive an invitation.",
          variant: "destructive",
        });
        
        // Optionally show additional information about the organization
        if (details.organizationName) {
          setTimeout(() => {
            toast({
              title: `Organization: ${details.organizationName}`,
              description: "Contact your administrator for access, or check your email for an existing invitation.",
              variant: "default",
            });
          }, 2000);
        }
        return;
      }
      
      // Handle other registration errors
      let errorMessage = "Unable to create account. Please try again.";
      if (error?.data?.message) {
        errorMessage = error.data.message;
      }
      
      toast({
        title: "Registration failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden text-white"
      style={{ background: "linear-gradient(180deg, #343F78 0%, #252D52 100%)" }}
    >
      {/* Animated gradient halo background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div 
          className="w-[600px] h-[600px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.4) 0%, rgba(147,51,234,0.3) 50%, rgba(99,102,241,0.3) 100%)',
            animation: 'gradientHalo 8s ease-in-out infinite'
          }}
        />
      </div>
      
      <Card className="w-full max-w-md relative z-10 card-enter rounded-xl border border-border shadow-sm text-white">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <Server className="text-white h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl gradient-text">
            {isRegistering ? "Join Your Company" : "Sign In to AssetVault"}
          </CardTitle>
          {isRegistering && (
            <p className="text-sm text-muted-foreground mt-2">
              Create a new company account. Only one admin signup is allowed per company. Additional team members must be invited by the admin.
            </p>
          )}
        </CardHeader>
        
        <CardContent>
          {isRegistering ? (
            <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    {...registerForm.register("firstName")}
                    placeholder="John"
                    data-testid="input-first-name"
                  />
                  {registerForm.formState.errors.firstName && (
                    <p className="text-red-500 text-sm mt-1">
                      {registerForm.formState.errors.firstName.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    {...registerForm.register("lastName")}
                    placeholder="Smith"
                    data-testid="input-last-name"
                  />
                  {registerForm.formState.errors.lastName && (
                    <p className="text-red-500 text-sm mt-1">
                      {registerForm.formState.errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...registerForm.register("email")}
                  placeholder="john@company.com"
                  data-testid="input-email"
                />
                {registerForm.formState.errors.email && (
                  <p className="text-red-500 text-sm mt-1">
                    {registerForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  {...registerForm.register("password")}
                  placeholder="••••••••"
                  data-testid="input-password"
                />
                {registerForm.formState.errors.password && (
                  <p className="text-red-500 text-sm mt-1">
                    {registerForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="tenantName">Company Name</Label>
                <Input
                  id="tenantName"
                  {...registerForm.register("tenantName")}
                  placeholder="Enter your company name (e.g. Acme Corp)"
                  data-testid="input-tenant-name"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  You will become the administrator for this company. Additional team members must be invited later.
                </p>
                {registerForm.formState.errors.tenantName && (
                  <p className="text-red-500 text-sm mt-1">
                    {registerForm.formState.errors.tenantName.message}
                  </p>
                )}
              </div>
              
              <Button 
                type="submit" 
                className="w-full"
                disabled={registerForm.formState.isSubmitting}
                data-testid="button-register"
              >
                {registerForm.formState.isSubmitting ? "Creating Account..." : "Create Account"}
              </Button>
              
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="text-primary hover:underline text-sm"
                  data-testid="link-to-login"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...loginForm.register("email")}
                  placeholder="admin@company.com"
                  data-testid="input-email"
                />
                {loginForm.formState.errors.email && (
                  <p className="text-red-500 text-sm mt-1">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  {...loginForm.register("password")}
                  placeholder="••••••••"
                  data-testid="input-password"
                />
                {loginForm.formState.errors.password && (
                  <p className="text-red-500 text-sm mt-1">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" />
                  <Label htmlFor="remember" className="text-sm">Remember me</Label>
                </div>
                <button
                  type="button"
                  className="text-primary hover:underline text-sm"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
              </div>
              
              <Button 
                type="submit" 
                className="w-full"
                disabled={loginForm.formState.isSubmitting}
                data-testid="button-login"
              >
                {loginForm.formState.isSubmitting ? "Signing in..." : "Sign In"}
              </Button>
              
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsRegistering(true)}
                  className="text-primary hover:underline text-sm"
                  data-testid="link-to-register"
                >
                  Don't have an account? Sign up
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
