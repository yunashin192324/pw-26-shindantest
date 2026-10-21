import type { Feature, ProductId, TagId } from '../data/types';

export interface FeatureFilter {
  products: ProductId[];
  tags: TagId[];
  /** タグの組み合わせ方: any = いずれかを含む, all = すべてを含む */
  tagMode: 'any' | 'all';
  sections: string[];
}

export const emptyFilter: FeatureFilter = { products: [], tags: [], tagMode: 'any', sections: [] };

/**
 * 絞り込み。条件の種類（製品・用途・節）どうしは「かつ」、
 * 同じ種類の中では、製品と節は「いずれか」、用途は tagMode に従う。
 */
export function filterFeatures(list: Feature[], filter: FeatureFilter): Feature[] {
  return list.filter((f) => {
    if (filter.products.length && !f.products.some((p) => filter.products.includes(p))) return false;
    if (filter.sections.length && !filter.sections.includes(f.section)) return false;
    if (filter.tags.length) {
      const ok =
        filter.tagMode === 'all'
          ? filter.tags.every((t) => f.tags.includes(t))
          : filter.tags.some((t) => f.tags.includes(t));
      if (!ok) return false;
    }
    return true;
  });
}

export function countByProduct(list: Feature[], product: ProductId): number {
  return list.filter((f) => f.products.includes(product)).length;
}
