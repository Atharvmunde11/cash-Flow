import mongoose, { Schema } from "mongoose";

const CounterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter =
  mongoose.models.Counter ?? mongoose.model("Counter", CounterSchema);

export async function getNextBillNumber(
  kind: "sale" | "purchase" = "sale"
): Promise<string> {
  const year = new Date().getFullYear();
  const key = kind === "sale" ? `bill-${year}` : `purchase-${year}`;
  const prefix = kind === "sale" ? "INV" : "PUR";
  const c = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = c?.seq ?? 1;
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}
