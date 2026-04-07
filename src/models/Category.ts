import mongoose, { Schema, type InferSchemaType } from "mongoose";

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    /** Root → leaf ids for aggregation */
    ancestorIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    /** Display color: hex string or CSS gradient */
    color: { type: String, default: null },
  },
  { timestamps: true }
);

CategorySchema.index({ parentId: 1 });
CategorySchema.index({ name: "text" });

export type CategoryDocument = InferSchemaType<typeof CategorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Category =
  mongoose.models.Category ?? mongoose.model("Category", CategorySchema);
