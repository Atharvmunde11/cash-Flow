import mongoose, { Schema, type InferSchemaType } from "mongoose";

const BillLineSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const BillSundryChargeSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const BillSchema = new Schema(
  {
    billKind: {
      type: String,
      enum: ["sale", "purchase"],
      default: "sale",
    },
    /** Business date (invoice / purchase date) */
    billDate: { type: Date, default: Date.now },
    billNumber: { type: String, required: true, unique: true },
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: false },
    displayName: { type: String, required: true },
    lines: { type: [BillLineSchema], required: true },
    sundryCharges: { type: [BillSundryChargeSchema], default: [] },
    total: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0 },
    creditAmount: { type: Number, required: true, min: 0 },
    paymentMode: {
      type: String,
      enum: ["cash", "upi", "credit", "mixed", "bank"],
      required: true,
    },
    bankAccountId: {
      type: Schema.Types.ObjectId,
      ref: "BankAccount",
      required: false,
    },
    hourOfDay: { type: Number, min: 0, max: 23, required: true },
    notes: { type: String, default: "" },
    stockWarnings: {
      type: [
        {
          itemId: Schema.Types.ObjectId,
          itemName: String,
          requested: Number,
          available: Number,
          appliedNegative: Boolean,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

BillSchema.index({ partyId: 1, createdAt: -1 });
BillSchema.index({ createdAt: -1 });

export type BillDocument = InferSchemaType<typeof BillSchema> & {
  _id: mongoose.Types.ObjectId;
};

const existingBillModel = mongoose.models.Bill as
  | mongoose.Model<BillDocument>
  | undefined;

if (process.env.NODE_ENV === "development" && existingBillModel) {
  delete mongoose.models.Bill;
}

export const Bill =
  (mongoose.models.Bill as mongoose.Model<BillDocument> | undefined) ??
  mongoose.model<BillDocument>("Bill", BillSchema);
