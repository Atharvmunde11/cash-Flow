"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(
      "Sign in submitted. Connect this form to your authentication logic.",
    );
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-10 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in with your business email and password.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
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
              placeholder="Enter your password"
              required
            />
          </div>

          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>

        {message ? (
          <p className="mt-4 text-sm text-green-600 dark:text-green-400">{message}</p>
        ) : null}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href="/authentication/signup"
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </div>
      </section>
    </main>
  );
}
