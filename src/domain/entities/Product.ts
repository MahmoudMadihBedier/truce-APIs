export interface Product {
  sr_no?: number;
  product_id: string;
  product_name: string;
  product_category: string;
  brand_name: string;
  product_url: string;
  current_price_egp: number;
  previous_price_egp: number | null;
  product_image_url: string;
  store_name: string;
  discounts_offers: string | null;
  availability_status: 'In Stock' | 'Out of Stock' | 'Pre-order';
  location_city: string | null;
  last_updated_utc: string;
}

export interface ProductFilters {
  product_id?: string;
  product_name?: string;
  category?: string;
  brand_name?: string;
  store_name?: string;
  location_city?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedProducts {
  products: Product[];
  total_count: number;
  timestamp: string;
}
