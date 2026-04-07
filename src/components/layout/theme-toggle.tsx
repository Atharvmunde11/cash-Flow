"use client";

import { Check, Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const LIGHT_THEMES = [{ value: "light", label: "Light Modern" }];

const DARK_THEMES = [{ value: "dark", label: "Dark Modern" }];

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg size-9 hover:bg-muted transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Toggle theme"
          />
        }
        disabled={!isClient}
      >
        <Palette className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Light Themes
          </div>
          {LIGHT_THEMES.map((t) => (
            <DropdownMenuCheckboxItem
              key={t.value}
              checked={theme === t.value}
              onCheckedChange={() => setTheme(t.value)}
            >
              <span className="flex items-center gap-2">
                {theme === t.value && <Check className="size-4" />}
                {t.label}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Dark Themes
          </div>
          {DARK_THEMES.map((t) => (
            <DropdownMenuCheckboxItem
              key={t.value}
              checked={theme === t.value}
              onCheckedChange={() => setTheme(t.value)}
            >
              <span className="flex items-center gap-2">
                {theme === t.value && <Check className="size-4" />}
                {t.label}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
