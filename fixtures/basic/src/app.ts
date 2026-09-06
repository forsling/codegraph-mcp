export let currentTenant = "default";

export function setCurrentTenant(tenant: string): void {
  currentTenant = tenant;
}

export function calculateTax(amount: number): number {
  return amount * 0.25;
}

export function calculateInvoice(amount: number): number {
  const tenant = currentTenant;
  return tenant === "vip" ? amount : amount + calculateTax(amount);
}

export function checkout(amount: number): number {
  setCurrentTenant("vip");
  return calculateInvoice(amount);
}
