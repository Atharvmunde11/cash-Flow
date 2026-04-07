"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  categoryCreateSchema,
  type CategoryCreateInput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaginationControls } from "@/components/shared/pagination-controls";

type Cat = {
  _id: string;
  name: string;
  parentId: string | null;
  color?: string | null;
};

const GRADIENT_PRESETS = [
  "linear-gradient(135deg, #2563eb, #06b6d4)",
  "linear-gradient(135deg, #f59e0b, #ef4444)",
  "linear-gradient(135deg, #10b981, #84cc16)",
  "linear-gradient(135deg, #8b5cf6, #ec4899)",
];

function isSolidColor(value: string | null | undefined) {
  return Boolean(value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value));
}

function isGradient(value: string | null | undefined) {
  return Boolean(value && value.includes("gradient("));
}

function parseGradient(value: string | null | undefined) {
  const fallback = {
    angle: 135,
    start: "#2563eb",
    end: "#06b6d4",
  };

  if (!value || !isGradient(value)) return fallback;

  const match = value.match(
    /linear-gradient\((\d+)deg,\s*(#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\)/,
  );

  if (!match) return fallback;

  return {
    angle: Number(match[1]),
    start: match[2],
    end: match[3],
  };
}

function buildGradient(angle: number, start: string, end: string) {
  return `linear-gradient(${angle}deg, ${start}, ${end})`;
}

async function fetchCats() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: Cat[] }).data;
}

function buildTree(cats: Cat[]): Array<Cat & { depth: number }> {
  const roots = cats.filter((c) => !c.parentId);
  const out: Array<Cat & { depth: number }> = [];

  function walk(node: Cat, depth: number) {
    out.push({ ...node, depth });
    cats
      .filter((c) => c.parentId === node._id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((ch) => walk(ch, depth + 1));
  }

  roots.sort((a, b) => a.name.localeCompare(b.name)).forEach((r) => walk(r, 0));

  return out;
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [colorMode, setColorMode] = useState<"solid" | "gradient">("solid");
  const [gradientAngle, setGradientAngle] = useState(135);
  const [gradientStart, setGradientStart] = useState("#2563eb");
  const [gradientEnd, setGradientEnd] = useState("#06b6d4");

  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCats,
  });

  const form = useForm<CategoryCreateInput>({
    resolver: zodResolver(
      categoryCreateSchema,
    ) as Resolver<CategoryCreateInput>,
    defaultValues: { name: "", parentId: "", color: "" },
  });
  const colorValue = form.watch("color") || "";

  // ─── CREATE ───
  const create = useMutation({
    mutationFn: async (values: CategoryCreateInput) => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Category created");
      qc.invalidateQueries({ queryKey: ["categories"] });
      form.reset();
      setDialogOpen(false);
    },
  });

  // ─── UPDATE ───
  const update = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: CategoryCreateInput;
    }) => {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Category updated");
      qc.invalidateQueries({ queryKey: ["categories"] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  // ─── DELETE ───
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Category deleted");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const tree = cats.data ? buildTree(cats.data) : [];
  const filteredTree = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tree;
    return tree.filter((category) =>
      [category.name, category.color ?? ""].join(" ").toLowerCase().includes(query),
    );
  }, [search, tree]);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredTree.length / pageSize));
  const paginatedTree = filteredTree.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Organize items into groups.
          </p>
        </div>

        <Button
          onClick={() => {
            setEditing(null);
            form.reset({ name: "", parentId: "", color: "" });
            setColorMode("solid");
            setGradientAngle(135);
            setGradientStart("#2563eb");
            setGradientEnd("#06b6d4");
            setDialogOpen(true);
          }}
        >
          Add category
        </Button>
      </div>

      {/* ─── LIST ─── */}
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search categories or colors..."
        className="max-w-sm"
      />

      <ul className="rounded-xl border divide-y text-sm overflow-hidden">
        {paginatedTree.map((c) => (
          <li
            key={c._id}
            className="group flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition"
            style={{ paddingLeft: 12 + c.depth * 16 }}
          >
            {/* Name */}
            <div className="flex items-center gap-2">
              {c.depth > 0 && <span className="text-muted-foreground">└</span>}
              <span
                className="h-3 w-3 rounded-full border"
                style={{ background: c.color || "transparent" }}
              />
              <span className="font-medium">{c.name}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(c);
                  const parsed = parseGradient(c.color || "");
                  form.reset({
                    name: c.name,
                    parentId: c.parentId || "",
                    color: c.color || "",
                  });
                  setColorMode(isGradient(c.color) ? "gradient" : "solid");
                  setGradientAngle(parsed.angle);
                  setGradientStart(parsed.start);
                  setGradientEnd(parsed.end);
                  setDialogOpen(true);
                }}
              >
                Edit
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="text-red-500"
                onClick={() => {
                  if (!confirm("Delete category?")) return;
                  remove.mutate(c._id);
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
        {paginatedTree.length === 0 ? (
          <li className="px-3 py-10 text-center text-muted-foreground">
            No categories found.
          </li>
        ) : null}
      </ul>
      <div className="rounded-xl border">
        <PaginationControls
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={filteredTree.length}
          itemLabel="categories"
          onPageChange={setPage}
        />
      </div>

      {/* ─── DIALOG ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit category" : "New category"}
            </DialogTitle>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={form.handleSubmit((v) => {
              if (editing) {
                update.mutate({ id: editing._id, values: v });
              } else {
                create.mutate(v);
              }
            })}
          >
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input {...form.register("name")} />
            </div>

            <div className="space-y-1.5">
              <Label>Parent</Label>
              <Select
                value={form.watch("parentId") || "__none__"}
                onValueChange={(v) =>
                  form.setValue("parentId", v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Top level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Top level</SelectItem>
                  {cats.data?.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Color or gradient</Label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={colorMode === "solid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setColorMode("solid");
                      form.setValue(
                        "color",
                        isSolidColor(colorValue) ? colorValue : gradientStart,
                      );
                    }}
                  >
                    Solid
                  </Button>
                  <Button
                    type="button"
                    variant={colorMode === "gradient" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setColorMode("gradient");
                      form.setValue(
                        "color",
                        buildGradient(
                          gradientAngle,
                          gradientStart,
                          gradientEnd,
                        ),
                      );
                    }}
                  >
                    Gradient
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  {colorMode === "solid" ? (
                    <Input
                      type="color"
                      value={isSolidColor(colorValue) ? colorValue : "#3b82f6"}
                      onChange={(e) => form.setValue("color", e.target.value)}
                      className="h-11 w-14 cursor-pointer p-1"
                    />
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={gradientStart}
                        onChange={(e) => {
                          const next = e.target.value;
                          setGradientStart(next);
                          form.setValue(
                            "color",
                            buildGradient(gradientAngle, next, gradientEnd),
                          );
                        }}
                        className="h-11 w-14 cursor-pointer p-1"
                      />
                      <Input
                        type="color"
                        value={gradientEnd}
                        onChange={(e) => {
                          const next = e.target.value;
                          setGradientEnd(next);
                          form.setValue(
                            "color",
                            buildGradient(gradientAngle, gradientStart, next),
                          );
                        }}
                        className="h-11 w-14 cursor-pointer p-1"
                      />
                    </div>
                  )}
                  <div
                    className="h-11 flex-1 rounded-md border"
                    style={{
                      background:
                        colorValue ||
                        "linear-gradient(135deg, #e5e7eb, #cbd5e1)",
                    }}
                  />
                </div>

                {colorMode === "gradient" ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Angle</span>
                        <span className="text-muted-foreground">
                          {gradientAngle}°
                        </span>
                      </div>
                      <Input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={gradientAngle}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setGradientAngle(next);
                          form.setValue(
                            "color",
                            buildGradient(next, gradientStart, gradientEnd),
                          );
                        }}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {GRADIENT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="h-9 w-16 rounded-md border"
                          style={{ background: preset }}
                          onClick={() => {
                            const parsed = parseGradient(preset);
                            setGradientAngle(parsed.angle);
                            setGradientStart(parsed.start);
                            setGradientEnd(parsed.end);
                            form.setValue("color", preset);
                          }}
                          aria-label={`Use gradient ${preset}`}
                        />
                      ))}
                    </div>
                  </>
                ) : null}

                <Input
                  placeholder="e.g. #3b82f6 or linear-gradient(90deg, #f59e0b, #ef4444)"
                  {...form.register("color")}
                />
              </div>
            </div>

            <Button type="submit">{editing ? "Update" : "Create"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
