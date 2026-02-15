import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ShieldAlert, FileSearch, BarChart3, Lock, CheckCircle2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white selection:bg-indigo-100">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/25">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-slate-900">DocGuard</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <Link href="/dashboard">
                <Button className="font-semibold rounded-full px-6">Go to Dashboard</Button>
              </Link>
            ) : (
              <Link href="/login">
              <Button className="font-semibold rounded-full px-6 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
                Sign In
              </Button>
            </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-24 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 mb-6">
                <span className="flex h-2 w-2 rounded-full bg-indigo-600 mr-2"></span>
                v2.0 Now Available with Gemini AI
              </div>
              <h1 className="text-5xl lg:text-7xl font-display font-bold tracking-tight text-slate-900 leading-[1.1] mb-6">
                Intelligent <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-600">Document</span> Security
              </h1>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-lg">
                Automate risk analysis, extract insights, and secure your documents with enterprise-grade AI. Understand your data in seconds, not hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/signup">
                <Button 
                  size="lg" 
                  className="rounded-full text-base font-semibold px-8 h-12 shadow-xl shadow-primary/20 hover:translate-y-[-2px] transition-all"
                >
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
                <Button variant="outline" size="lg" className="rounded-full text-base font-semibold px-8 h-12 border-slate-200">
                  View Demo
                </Button>
              </div>
              
              <div className="mt-10 flex items-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>SOC2 Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>End-to-end Encrypted</span>
                </div>
              </div>
            </motion.div>

            {/* Abstract visual */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative lg:ml-auto"
            >
              <div className="relative rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-slate-900/5 rotate-[-2deg] hover:rotate-0 transition-all duration-500">
                 {/* Placeholder for dashboard screenshot */}
                 <div className="aspect-[4/3] rounded-xl bg-slate-50 border border-slate-100 overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-white flex items-center justify-center">
                       <div className="text-center space-y-4">
                          <div className="h-24 w-24 bg-white rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-4">
                            <BarChart3 className="h-10 w-10 text-primary" />
                          </div>
                          <p className="font-display font-bold text-slate-900 text-lg">Real-time Risk Analytics</p>
                          <div className="flex justify-center gap-2">
                             <div className="h-2 w-16 bg-slate-200 rounded-full"></div>
                             <div className="h-2 w-8 bg-slate-200 rounded-full"></div>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-display font-bold text-slate-900 mb-4">Why DocGuard?</h2>
            <p className="text-slate-600">Enterprise features built for modern compliance teams.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: FileSearch,
                title: "AI Extraction",
                desc: "Automatically extract key data points from unstructured PDFs using Google Gemini."
              },
              {
                icon: ShieldAlert,
                title: "Risk Scoring",
                desc: "Identify high-risk clauses and compliance violations instantly with automated scoring."
              },
              {
                icon: Lock,
                title: "Secure Storage",
                desc: "Bank-grade encryption for all your sensitive documents and analysis data."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold font-display text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
