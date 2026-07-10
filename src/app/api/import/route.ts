import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { decodeImportBuffer } from "@/lib/import/parse-utils";
import {
  busyFileLooksMastersOnly,
  detectAndParseImportFile,
  mergeParsedImportData,
  type ImportResult,
  type ParsedImportData,
} from "@/lib/import/parse-import-file";
import { importParsedData } from "@/lib/services/import-service";
import { z } from "zod";

export const runtime = "nodejs";

const MAX_BYTES_PER_FILE = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 20;

const bodySchema = z.object({
  mode: z.enum(["merge", "replace"]).default("merge"),
  source: z.enum(["auto", "tally", "busy"]).default("auto"),
  includeVouchers: z.coerce.boolean().default(true),
});

function collectUploadFiles(form: FormData): File[] {
  const fromPlural = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);
  if (fromPlural.length > 0) return fromPlural;

  const single = form.get("file");
  if (single instanceof File) return [single];
  return [];
}

export async function POST(req: Request) {
  try {
    await connectDb();

    const form = await req.formData();
    const files = collectUploadFiles(form);
    const modeRaw = form.get("mode");
    const sourceRaw = form.get("source");
    const includeVouchersRaw = form.get("includeVouchers");

    if (files.length === 0) {
      return jsonError("Choose at least one file to import", 422);
    }
    if (files.length > MAX_FILES) {
      return jsonError(`Too many files (max ${MAX_FILES})`, 413);
    }

    const parsedBody = bodySchema.safeParse({
      mode: typeof modeRaw === "string" ? modeRaw : "merge",
      source: typeof sourceRaw === "string" ? sourceRaw : "auto",
      includeVouchers:
        includeVouchersRaw === "false" || includeVouchersRaw === "0"
          ? false
          : true,
    });
    if (!parsedBody.success) {
      return jsonError(JSON.stringify(parsedBody.error.flatten()), 422);
    }

    const sourceHint =
      parsedBody.data.source === "auto" ? undefined : parsedBody.data.source;
    const preWarnings: string[] = [];
    const parsedChunks: ParsedImportData[] = [];
    let totalBytes = 0;

    for (const file of files) {
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return jsonError(`Total upload too large (max ${MAX_TOTAL_BYTES / (1024 * 1024)} MB)`, 413);
      }
      if (file.size > MAX_BYTES_PER_FILE) {
        return jsonError(`${file.name} is too large (max 25 MB per file)`, 413);
      }

      const buffer = await file.arrayBuffer();
      const text = decodeImportBuffer(buffer);

      if (busyFileLooksMastersOnly(text)) {
        preWarnings.push(
          `${file.name}: BUSY masters export only (no invoice vouchers). Export Transactions (Sale, Purchase, etc.) as a separate .dat file and include it in this import.`,
        );
      }

      try {
        parsedChunks.push(
          detectAndParseImportFile(file.name, text, sourceHint),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not read file";
        return jsonError(`${file.name}: ${msg}`, 422);
      }
    }

    const data = mergeParsedImportData(parsedChunks);
    const result = await importParsedData(data, parsedBody.data.mode, {
      includeVouchers: parsedBody.data.includeVouchers,
    });

    const merged: ImportResult = {
      ...result,
      filesProcessed: files.length,
      fileNames: files.map((f) => f.name),
      warnings: [
        ...(files.length > 1
          ? [`Merged ${files.length} files: ${files.map((f) => f.name).join(", ")}`]
          : []),
        ...preWarnings,
        ...result.warnings,
      ],
    };

    return jsonOk(merged);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    return jsonError(msg, 500);
  }
}
