"use client";

import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VoiceButton() {
  return (
    <Button
      type="button"
      className="h-14 w-full rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg transition-transform hover:scale-[1.01]"
    >
      <Mic className="size-5" />
      Tap to speak
    </Button>
  );
}
