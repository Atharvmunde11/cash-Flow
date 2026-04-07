import mongoose, { Schema, type InferSchemaType } from "mongoose";

const PaymentSchema = new Schema(
  {
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMode: {
      type: String,
      enum: ["cash", "upi", "bank"],
      required: true,
    },
    bankAccountId: {
      type: Schema.Types.ObjectId,
      ref: "BankAccount",
      default: null,
    },
    date: { type: Date, required: true },
    notes: { type: String, default: "" },
    direction: {
      type: String,
      enum: ["received", "paid"],
      required: true,
    },
  },
  { timestamps: true },
);

PaymentSchema.index({ partyId: 1, date: -1 });
PaymentSchema.index({ date: -1 });

export type PaymentDocument = InferSchemaType<typeof PaymentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Payment =
  mongoose.models.Payment ?? mongoose.model("Payment", PaymentSchema);
