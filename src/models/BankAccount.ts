import mongoose, { Schema, type InferSchemaType } from "mongoose";

const BankAccountSchema = new Schema(
  {
    accountName: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    ifscCode: { type: String, trim: true, default: "" },
    upiId: { type: String, trim: true, default: "" },
    isPrimary: { type: Boolean, default: false },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

BankAccountSchema.index({ isPrimary: -1 });

export type BankAccountDocument = InferSchemaType<typeof BankAccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const BankAccount =
  mongoose.models.BankAccount ??
  mongoose.model("BankAccount", BankAccountSchema);
