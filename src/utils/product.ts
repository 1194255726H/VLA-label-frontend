export function productReference(item: Record<string, unknown>) {
  const product = item.product && typeof item.product === 'object' ? item.product as Record<string, unknown> : {}
  const id = item.product_id ?? product.id
  return { productId: id == null ? undefined : String(id), productName: String(product.name || '') }
}
