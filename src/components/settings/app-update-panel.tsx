"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version?: string }
  | { status: "not-available"; version?: string }
  | { status: "downloading"; percent?: number }
  | { status: "downloaded"; version?: string }
  | { status: "error"; message?: string }
  | { status: "dev"; message?: string };

const RELEASES_URL = "https://github.com/Atharvmunde11/cash-Flow/releases";

function friendlyUpdateError(message?: string) {
  if (!message) return "Update check failed.";
  if (message.includes("latest.yml") || message.includes("latest-arm64.yml")) {
    return message;
  }
  const firstLine = message.split("\n")[0]?.trim() ?? message;
  return firstLine.length > 240 ? `${firstLine.slice(0, 237)}…` : firstLine;
}

export function AppUpdatePanel() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: "idle" });

  useEffect(() => {
    const api = window.cashflow;
    if (!api) return;

    setIsDesktop(true);
    void api.getAppVersion().then(setAppVersion);

    return api.onUpdateStatus((payload) => {
      setUpdateStatus(payload as UpdateStatus);
    });
  }, []);

  if (!isDesktop) return null;

  async function handleCheck() {
    const api = window.cashflow;
    if (!api) return;

    setUpdateStatus({ status: "checking" });
    try {
      const result = await api.checkForUpdates();
      setUpdateStatus(result as UpdateStatus);

      if (result.status === "available") {
        toast.info(`Update available: v${result.version ?? "new"}`);
      } else if (result.status === "not-available") {
        toast.success("You're on the latest version.");
      } else if (result.status === "error") {
        toast.error(result.message ?? "Could not check for updates.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update check failed";
      setUpdateStatus({ status: "error", message });
      toast.error(message);
    }
  }

  async function handleDownload() {
    const api = window.cashflow;
    if (!api) return;

    setUpdateStatus({ status: "downloading", percent: 0 });
    try {
      const result = await api.downloadUpdate();
      if (!result.ok) {
        throw new Error(result.message ?? "Download failed");
      }
      toast.success("Update downloaded. Restart to install.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed";
      setUpdateStatus({ status: "error", message });
      toast.error(message);
    }
  }

  function handleInstall() {
    window.cashflow?.quitAndInstall();
  }

  const statusMessage = (() => {
    switch (updateStatus.status) {
      case "checking":
        return "Checking GitHub Releases…";
      case "available":
        return `Version ${updateStatus.version ?? "new"} is available.`;
      case "not-available":
        return "You're on the latest release.";
      case "downloading":
        return `Downloading… ${Math.round(updateStatus.percent ?? 0)}%`;
      case "downloaded":
        return `Version ${updateStatus.version ?? "new"} is ready to install.`;
      case "error":
        return friendlyUpdateError(updateStatus.message);
      case "dev":
        return updateStatus.message ?? "Updates run in the installed app only.";
      default:
        return "CashFlow checks GitHub Releases for new installers on startup.";
    }
  })();

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div>
        <h2 className="text-lg font-medium">App updates</h2>
        <p className="text-sm text-muted-foreground">
          Installed version{" "}
          <span className="font-medium text-foreground">{appVersion ?? "…"}</span>
          {" · "}
          by{" "}
          <a
            href={RELEASES_URL}
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Atharv Munde
          </a>
        </p>
      </div>

      <p className="text-sm text-muted-foreground">{statusMessage}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => void handleCheck()}
          disabled={updateStatus.status === "checking" || updateStatus.status === "downloading"}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Check for updates
        </Button>

        {updateStatus.status === "available" ? (
          <Button onClick={() => void handleDownload()}>
            <Download className="mr-2 h-4 w-4" />
            Download update
          </Button>
        ) : null}

        {updateStatus.status === "downloaded" ? (
          <Button onClick={handleInstall}>Restart &amp; install</Button>
        ) : null}
      </div>
    </div>
  );
}
