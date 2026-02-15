import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setToken } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileSearch } from "lucide-react";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { refetch: refetchUser } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Login failed", description: data.message || "Invalid credentials", variant: "destructive" });
        return;
      }
      setToken(data.token);
      await refetchUser();
      toast({ title: "Welcome back", description: "You are now signed in." });
      setLocation("/dashboard");
    } catch (err) {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Link href="/">
            <div className="inline-flex items-center gap-2 text-slate-900 font-display font-bold text-2xl mb-2">
              <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center text-white">
                <FileSearch className="h-6 w-6" />
              </div>
              Document Intelligence
            </div>
          </Link>
          <p className="text-slate-500 text-sm">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-lg"
            />
          </div>
          <Button type="submit" className="w-full rounded-lg" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Sign in"}
          </Button>
          <p className="text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup">
              <a className="text-primary font-medium hover:underline">Sign up</a>
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
