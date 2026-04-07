"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function SignUpPage() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(
      "Sign up submitted. Connect this form to your account creation logic.",
    );
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-10 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">
            Create your business account
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sign up with your business email, password, and company name.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              type="text"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="Your business name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              required
            />
          </div>

          <Button type="submit" className="w-full">
            Sign up
          </Button>
        </form>

        {message ? (
          <p className="mt-4 text-sm text-green-600 dark:text-green-400">{message}</p>
        ) : null}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/authentication/signin"
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
