"use client";

import { AgentSidebar } from "@/agent/AgentSidebar";

interface AgentChatSidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function AgentChatSidebar({
  isOpen,
  setIsOpen,
}: AgentChatSidebarProps) {
  return <AgentSidebar isOpen={isOpen} setIsOpen={setIsOpen} />;
}
