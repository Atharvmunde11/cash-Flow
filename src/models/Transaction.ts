import mongoose, { Schema, type InferSchemaType } from "mongoose";

const TransactionSchema = new Schema(
  {
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true },
    partyType: { type: String, enum: ["customer", "supplier"], required: true },
    entryType: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMode: {
      type: String,
      enum: ["cash", "upi", "credit"],
      required: true,
    },
    date: { type: Date, required: true },
    notes: { type: String, default: "" },
    refType: {
      type: String,
      enum: [
        "manual",
        "bill_invoice",
        "bill_payment",
        "purchase_invoice",
        "purchase_payment",
        "adjustment",
      ],
      default: "manual",
    },
    billId: { type: Schema.Types.ObjectId, ref: "Bill", default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    balanceAfterParty: { type: Number, default: null },
  },
  { timestamps: true }
);

TransactionSchema.index({ partyId: 1, date: -1 });
TransactionSchema.index({ date: -1 });
TransactionSchema.index({ createdAt: 1 });

export type TransactionDocument = InferSchemaType<typeof TransactionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const LedgerTransaction =
  mongoose.models.LedgerTransaction ??
  mongoose.model("LedgerTransaction", TransactionSchema);
