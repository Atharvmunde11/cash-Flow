import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    price: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    unit: { type: String, required: true, trim: true, default: "pieces" },
  },
  { timestamps: true },
);

ItemSchema.index({ categoryId: 1 });
ItemSchema.index({ name: "text" });

export type ItemDocument = InferSchemaType<typeof ItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Item = mongoose.models.Item ?? mongoose.model("Item", ItemSchema);
