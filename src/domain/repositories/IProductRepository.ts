import {
  Product,
  ProductFilters,
  PaginatedProducts,
} from '../entities/Product';

/**
 * Interface for the Product Repository
 */
export interface IProductRepository {
  /**
   * Saves a product to the repository
   * @param product The product to save
   */
  save(product: Product): Promise<void>;

  /**
   * Saves multiple products to the repository
   * @param products The products to save
   */
  saveAll(products: Product[]): Promise<void>;

  /**
   * Finds products based on filters
   * @param filters The filters to apply
   */
  find(filters: ProductFilters): Promise<PaginatedProducts>;

  /**
   * Finds a single product by its URL
   * @param url The product URL
   */
  findByUrl(url: string): Promise<Product | null>;
}
