import mongoose, { Schema } from "mongoose";

const PartySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    openingBalance: { type: Number, default: 0 },
    /** Positive = customer owes us / we owe supplier (see partyType) */
    balance: { type: Number, default: 0 },
    partyType: {
      type: String,
      enum: ["customer", "supplier"],
      required: true,
    },
    lastPaymentAt: { type: Date, default: null },
    /** Customers only: warn if balance owed and no payment in this many days */
    maxDaysWithoutPayment: { type: Number, default: null, min: 1 },
  },
  { timestamps: true }
);

PartySchema.index({ name: "text", phone: "text" });
PartySchema.index({ partyType: 1, balance: -1 });
PartySchema.index({ name: 1 });

export interface PartyDocument extends mongoose.Document {
  name: string;
  phone?: string;
  address?: string;
  openingBalance: number;
  balance: number;
  partyType: "customer" | "supplier";
  lastPaymentAt: Date | null;
  maxDaysWithoutPayment: number | null;
}

export const Party =
  mongoose.models.Party ?? mongoose.model("Party", PartySchema);
