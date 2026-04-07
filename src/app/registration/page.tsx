"use client";

import { useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Building2,
  Globe,
  Users,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

export default function BusinessRegistrationPage() {
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState({
    businessName: "",
    email: "",
    phone: "",
    businessType: "",
    industry: "",
    employeeCount: "",
    description: "",
    address: "",
    taxId: "",
    discoverySource: "",
  });
  const [message, setMessage] = useState("");

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const nextStep = () =>
    setStep((prev) => (prev < 4 ? ((prev + 1) as Step) : prev));
  const prevStep = () =>
    setStep((prev) => (prev > 1 ? ((prev - 1) as Step) : prev));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < 4) {
      nextStep();
      return;
    }
    setMessage("Registration successful! Setting up your workspace...");
    console.log("Final Registration Data:", formData);
  };

  const steps = [
    { id: 1, label: "Basics", icon: Info },
    { id: 2, label: "Profile", icon: Building2 },
    { id: 3, label: "Details", icon: Globe },
    { id: 4, label: "Discovery", icon: Users },
  ];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4 py-12 relative">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-2xl">
        {/* Progress Stepper */}
        <nav className="mb-12 px-4" aria-label="Progress">
          <ol role="list" className="flex items-center justify-between w-full">
            {steps.map((s, i) => (
              <li
                key={s.id}
                className={cn("relative flex flex-col items-center flex-1")}
              >
                {i !== 0 && (
                  <div
                    className={cn(
                      "absolute top-5 left-[-50%] right-[50%] h-0.5 -z-10",
                      step > s.id - 1 ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
                <button
                  onClick={() => s.id < step && setStep(s.id as Step)}
                  disabled={s.id >= step}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full border-2 transition-all",
                    step === s.id
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                      : step > s.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted bg-background text-muted-foreground",
                  )}
                >
                  {step > s.id ? (
                    <Check className="size-5" />
                  ) : (
                    <s.icon className="size-5" />
                  )}
                </button>
                <span
                  className={cn(
                    "mt-3 text-xs font-medium transition-colors",
                    step >= s.id ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        </nav>

        <section className="rounded-[2rem] border border-border bg-card p-8 md:p-12 shadow-xl shadow-foreground/5 backdrop-blur-sm">
          <header className="mb-10">
            <h1 className="text-3xl font-bold tracking-tight">
              {step === 1 && "Let's start with the basics"}
              {step === 2 && "Tell us about your business"}
              {step === 3 && "Location & Identity"}
              {step === 4 && "One last thing..."}
            </h1>
            <p className="text-muted-foreground mt-2">
              {step === 1 &&
                "We'll use this information to create your account."}
              {step === 2 &&
                "This helps us customize the experience for your industry."}
              {step === 3 &&
                "Necessary for generating invoices and legal compliance."}
              {step === 4 &&
                "Help us grow by telling us how you found Ledger Studio."}
            </p>
          </header>

          <form className="space-y-8" onSubmit={handleSubmit}>
            {step === 1 && (
              <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    value={formData.businessName}
                    onChange={(e) =>
                      handleInputChange("businessName", e.target.value)
                    }
                    placeholder="Acme Corp"
                    required
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="ceo@acme.com"
                    required
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="h-12 text-base"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Select
                      value={formData.industry}
                      onValueChange={(v) =>
                        handleInputChange("industry", v || "")
                      }
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retail">
                          Retail & E-commerce
                        </SelectItem>
                        <SelectItem value="services">
                          Professional Services
                        </SelectItem>
                        <SelectItem value="manufacturing">
                          Manufacturing
                        </SelectItem>
                        <SelectItem value="tech">Technology</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Number of Employees</Label>
                  <Select
                    value={formData.employeeCount}
                    onValueChange={(v) =>
                      handleInputChange("employeeCount", v || "")
                    }
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="How many people?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Just me</SelectItem>
                      <SelectItem value="2-10">2-10 employees</SelectItem>
                      <SelectItem value="11-50">11-50 employees</SelectItem>
                      <SelectItem value="51-200">51-200 employees</SelectItem>
                      <SelectItem value="201+">201+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">
                    What does your business do?
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    placeholder="Briefly describe your products or services..."
                    className="min-h-32 text-base resize-none"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-2">
                  <Label htmlFor="address">Registered Business Address</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) =>
                      handleInputChange("address", e.target.value)
                    }
                    placeholder="Street address, City, State, ZIP code"
                    className="min-h-24 text-base resize-none"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID / GSTIN (Optional)</Label>
                  <Input
                    id="taxId"
                    value={formData.taxId}
                    onChange={(e) => handleInputChange("taxId", e.target.value)}
                    placeholder="e.g. 22AAAAA0000A1Z5"
                    className="h-12 text-base"
                  />
                  <p className="text-xs text-muted-foreground italic">
                    You can add this later in settings if you don&apos;t have it
                    handy.
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-2">
                  <Label>How did you hear about us?</Label>
                  <Select
                    value={formData.discoverySource}
                    onValueChange={(v) =>
                      handleInputChange("discoverySource", v || "")
                    }
                  >
                    <SelectTrigger className="h-12 w-full">
                      <SelectValue placeholder="Choose an option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google">Google Search</SelectItem>
                      <SelectItem value="social">
                        Social Media (LinkedIn, X, etc.)
                      </SelectItem>
                      <SelectItem value="friend">
                        From a Friend/Colleague
                      </SelectItem>
                      <SelectItem value="advertisement">
                        Advertisement
                      </SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-2xl bg-primary/5 p-6 border border-primary/10">
                  <div className="flex gap-4">
                    <div className="shrink-0">
                      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                        !
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">
                        Ready to go?
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        By clicking finish, you agree to our Terms of Service
                        and Privacy Policy. We&apos;ll set up your personalized
                        ledger immediately.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-6 gap-4">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  className="h-12 px-6 rounded-xl transition-all"
                >
                  <ChevronLeft className="mr-2 size-4" />
                  Back
                </Button>
              ) : (
                <div />
              )}

              <Button
                type="submit"
                className="h-12 px-8 rounded-xl font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 ml-auto"
              >
                {step === 4 ? "Complete Setup" : "Continue"}
                {step < 4 && <ChevronRight className="ml-2 size-4" />}
              </Button>
            </div>
          </form>

          {message ? (
            <div className="mt-8 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-center text-sm font-medium animate-in zoom-in duration-300">
              {message}
            </div>
          ) : null}
        </section>

        <footer className="mt-12 text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <a
            href="/authentication/signin"
            className="text-primary hover:underline font-medium"
          >
            Sign in to your dashboard
          </a>
        </footer>
      </div>
    </main>
  );
}
