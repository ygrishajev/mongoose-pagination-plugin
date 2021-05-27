import { Schema, Document, mquery, Schema, Model } from 'mongoose';

export type PaginationOptons = {
  after?: string;
  before?: string;
  last?: string;
  first?: string;
  sort?: string;
  withMeta?: string;
}

export type Paginate<T extends Document> = (options: PaginationOptons) => DocumentQuery<T, T>;

export interface PaginatedModel<T extends Document, K = {}> extends Model<T, K & {
  paginate: Paginate<T>
}> {
  paginate: Paginate<T>
}

export type PaginationPluginOptions = {
  paginationField: string
}

export function paginationPlugin(schema: Schema<any>, options: PaginationPluginOptions): DocumentQuery;
